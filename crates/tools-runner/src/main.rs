use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Deserialize)]
struct RpcRequest {
    id: Value,
    method: String,
    params: ToolCallParams,
}

#[derive(Debug, Deserialize)]
struct ToolCallParams {
    tool: String,
    #[serde(default)]
    args: Value,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<ToolResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
struct ToolResult {
    success: bool,
    data: Value,
}

#[derive(Debug, Serialize)]
struct RpcError {
    message: String,
}

fn main() {
    let workspace_root = match resolve_workspace_root() {
        Ok(path) => path,
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    };

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(value) => value,
            Err(err) => {
                eprintln!("failed to read stdin line: {err}");
                continue;
            }
        };

        if line.trim().is_empty() {
            continue;
        }

        let request = match serde_json::from_str::<RpcRequest>(&line) {
            Ok(req) => req,
            Err(err) => {
                let response = RpcResponse {
                    id: Value::Null,
                    result: None,
                    error: Some(RpcError {
                        message: format!("invalid request JSON: {err}"),
                    }),
                };
                write_response(&mut stdout, &response);
                continue;
            }
        };

        let response = handle_request(request, &workspace_root);
        write_response(&mut stdout, &response);
    }
}

fn write_response(stdout: &mut io::Stdout, response: &RpcResponse) {
    if let Ok(payload) = serde_json::to_string(response) {
        let _ = writeln!(stdout, "{payload}");
        let _ = stdout.flush();
    }
}

fn resolve_workspace_root() -> Result<PathBuf, String> {
    let root = env::var("WORKSPACE_ROOT").unwrap_or_else(|_| ".".to_string());
    let path = PathBuf::from(root);
    fs::canonicalize(path).map_err(|err| format!("failed to resolve WORKSPACE_ROOT: {err}"))
}

fn handle_request(request: RpcRequest, workspace_root: &Path) -> RpcResponse {
    if request.method != "tool.call" {
        return RpcResponse {
            id: request.id,
            result: None,
            error: Some(RpcError {
                message: format!("unsupported method: {}", request.method),
            }),
        };
    }

    let tool_result = match request.params.tool.as_str() {
        "fs.read" => fs_read(workspace_root, &request.params.args),
        "fs.list" => fs_list(workspace_root, &request.params.args),
        "fs.stat" => fs_stat(workspace_root, &request.params.args),
        "search.ripgrep" => search_ripgrep(workspace_root, &request.params.args),
        "shell.run" => shell_run(workspace_root, &request.params.args),
        _ => Err(format!("unsupported tool: {}", request.params.tool)),
    };

    match tool_result {
        Ok(data) => RpcResponse {
            id: request.id,
            result: Some(ToolResult {
                success: true,
                data,
            }),
            error: None,
        },
        Err(message) => RpcResponse {
            id: request.id,
            result: Some(ToolResult {
                success: false,
                data: json!({ "error": message }),
            }),
            error: Some(RpcError { message }),
        },
    }
}

fn get_arg_string(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("missing or invalid '{key}' argument"))
}

fn get_arg_bool(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(Value::as_bool)
}

fn resolve_existing_path(workspace_root: &Path, input: &str) -> Result<PathBuf, String> {
    let raw = PathBuf::from(input);
    let candidate = if raw.is_absolute() {
        raw
    } else {
        workspace_root.join(raw)
    };

    let canonical = fs::canonicalize(candidate).map_err(|err| format!("path resolution failed: {err}"))?;
    if !canonical.starts_with(workspace_root) {
        return Err("path is outside WORKSPACE_ROOT".to_string());
    }
    Ok(canonical)
}

fn relative_display_path(workspace_root: &Path, path: &Path) -> String {
    path.strip_prefix(workspace_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn fs_read(workspace_root: &Path, args: &Value) -> Result<Value, String> {
    let path_arg = get_arg_string(args, "path")?;
    let path = resolve_existing_path(workspace_root, &path_arg)?;
    let content = fs::read_to_string(&path).map_err(|err| format!("failed to read file: {err}"))?;

    Ok(json!({
        "path": relative_display_path(workspace_root, &path),
        "content": content
    }))
}

fn fs_list(workspace_root: &Path, args: &Value) -> Result<Value, String> {
    let path_arg = args
        .get("path")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| ".".to_string());
    let path = resolve_existing_path(workspace_root, &path_arg)?;

    let mut entries = Vec::new();
    for entry in fs::read_dir(&path).map_err(|err| format!("failed to list directory: {err}"))? {
        let entry = entry.map_err(|err| format!("failed to read directory entry: {err}"))?;
        let entry_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|err| format!("failed to read metadata: {err}"))?;

        entries.push(json!({
            "name": entry.file_name().to_string_lossy(),
            "path": relative_display_path(workspace_root, &entry_path),
            "isDir": metadata.is_dir(),
            "size": if metadata.is_file() { json!(metadata.len()) } else { Value::Null }
        }));
    }

    Ok(json!({ "entries": entries }))
}

fn fs_stat(workspace_root: &Path, args: &Value) -> Result<Value, String> {
    let path_arg = get_arg_string(args, "path")?;
    let path = resolve_existing_path(workspace_root, &path_arg)?;
    let metadata = fs::metadata(&path).map_err(|err| format!("failed to read metadata: {err}"))?;

    Ok(json!({
        "path": relative_display_path(workspace_root, &path),
        "isFile": metadata.is_file(),
        "isDir": metadata.is_dir(),
        "size": metadata.len()
    }))
}

fn search_ripgrep(workspace_root: &Path, args: &Value) -> Result<Value, String> {
    let pattern = args
        .get("pattern")
        .or_else(|| args.get("query"))
        .and_then(Value::as_str)
        .ok_or_else(|| "missing or invalid 'pattern' argument".to_string())?;

    let path_arg = args
        .get("path")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| ".".to_string());
    let search_path = resolve_existing_path(workspace_root, &path_arg)?;

    let output = Command::new("rg")
        .arg("--json")
        .arg("--line-number")
        .arg("--color")
        .arg("never")
        .arg(pattern)
        .arg(&search_path)
        .output()
        .map_err(|err| format!("failed to execute ripgrep: {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut matches = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let value: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if value.get("type").and_then(Value::as_str) != Some("match") {
            continue;
        }

        let data = &value["data"];
        matches.push(json!({
            "path": data["path"]["text"],
            "line": data["line_number"],
            "text": data["lines"]["text"]
        }));
    }

    let exit_code = output.status.code().unwrap_or(-1);
    let success = exit_code == 0 || exit_code == 1;
    if !success {
        return Err(format!(
            "ripgrep failed with code {}: {}",
            exit_code,
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let count = matches.len();
    Ok(json!({
        "matches": matches,
        "count": count
    }))
}

fn shell_run(workspace_root: &Path, args: &Value) -> Result<Value, String> {
    let command = get_arg_string(args, "command")?;
    let confirm = get_arg_bool(args, "confirm").unwrap_or(false);
    let confirm_required = env::var("SHELL_CONFIRM_REQUIRED")
        .unwrap_or_else(|_| "true".to_string())
        .to_lowercase()
        != "false";

    if confirm_required && !confirm {
        return Err("shell command confirmation required; pass args.confirm=true".to_string());
    }

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(command)
        .current_dir(workspace_root)
        .output()
        .map_err(|err| format!("failed to run shell command: {err}"))?;

    Ok(json!({
        "exitCode": output.status.code().unwrap_or(-1),
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr)
    }))
}
