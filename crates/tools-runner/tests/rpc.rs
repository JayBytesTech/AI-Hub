use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(prefix: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("{prefix}-{stamp}"));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn run_request(workspace_root: &PathBuf, request: Value, shell_confirm_required: Option<&str>) -> Value {
    let exe = std::env::var("CARGO_BIN_EXE_tools-runner").unwrap_or_else(|_| {
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("target");
        path.push("debug");
        path.push(if cfg!(windows) {
            "tools-runner.exe"
        } else {
            "tools-runner"
        });
        path.to_string_lossy().into_owned()
    });
    let mut cmd = Command::new(exe);
    cmd.env("WORKSPACE_ROOT", workspace_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    if let Some(value) = shell_confirm_required {
        cmd.env("SHELL_CONFIRM_REQUIRED", value);
    }

    let mut child = cmd.spawn().expect("spawn tools-runner");
    {
        let stdin = child.stdin.as_mut().expect("stdin");
        writeln!(stdin, "{}", request).expect("write request");
    }

    let output = child.wait_with_output().expect("wait output");
    assert!(output.status.success(), "runner exited with status: {:?}", output.status.code());

    let line = String::from_utf8(output.stdout).expect("utf8 stdout");
    let first_line = line.lines().next().expect("response line");
    serde_json::from_str(first_line).expect("json response")
}

#[test]
fn fs_read_returns_file_content() {
    let root = temp_dir("tools-runner-fs-read");
    let file = root.join("hello.txt");
    fs::write(&file, "hello world").expect("write test file");

    let req = json!({
      "id": "1",
      "method": "tool.call",
      "params": { "tool": "fs.read", "args": { "path": "hello.txt" } }
    });

    let response = run_request(&root, req, None);
    assert_eq!(response["result"]["success"], json!(true));
    assert_eq!(response["result"]["data"]["content"], json!("hello world"));
}

#[test]
fn shell_run_requires_confirmation_by_default() {
    let root = temp_dir("tools-runner-shell-confirm");
    let req = json!({
      "id": "2",
      "method": "tool.call",
      "params": { "tool": "shell.run", "args": { "command": "echo hi" } }
    });

    let response = run_request(&root, req, Some("true"));
    assert_eq!(response["result"]["success"], json!(false));
    assert_eq!(
        response["error"]["message"],
        json!("shell command confirmation required; pass args.confirm=true")
    );
}
