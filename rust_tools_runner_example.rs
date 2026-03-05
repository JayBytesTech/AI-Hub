
// Rust Tools Runner Skeleton

use serde::{Deserialize, Serialize};
use std::io::{self, Read};

#[derive(Deserialize)]
struct ToolRequest {
    tool: String,
    args: serde_json::Value,
}

#[derive(Serialize)]
struct ToolResponse {
    success: bool,
    result: serde_json::Value,
}

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();

    let req: ToolRequest = serde_json::from_str(&input).unwrap();

    let resp = ToolResponse {
        success: true,
        result: serde_json::json!({"message": "tool executed"}),
    };

    println!("{}", serde_json::to_string(&resp).unwrap());
}
