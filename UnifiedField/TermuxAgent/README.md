# HeavenzFire Termux Local Agent

A dependency-free Node.js CLI that connects to a llama.cpp OpenAI-compatible server on the same Android device. It is a practical first local agent interface for Termux, not a shell-executing autonomous agent.

## Start the local inference server

From the llama.cpp source directory, after a successful build and with a model file already present:

```sh
./build/bin/llama-server -m "$HOME/models/your-model.gguf" --host 127.0.0.1 --port 8080 -c 2048
```

Replace the model path with the actual GGUF file on the device. Keep the server bound to 127.0.0.1.

## Start HeavenzFire Local Agent

In a second Termux session, from the HeavenzFire repository root:

```sh
node UnifiedField/TermuxAgent/agent.cjs
```

Optional configuration:

```sh
HF_LOCAL_ENDPOINT=http://127.0.0.1:8080/v1/chat/completions \\
HF_LOCAL_MODEL=local-model \\
node UnifiedField/TermuxAgent/agent.cjs
```

Commands inside the agent: `:help`, `:reset`, `:quit`.

## Guardrails and boundaries

- Uses only Node.js built-ins; no package install is required (Node.js 18+).
- Endpoint validation permits only plain HTTP to loopback (`127.0.0.1`, `localhost`, or `::1`) and the exact chat-completions path.
- No shell, filesystem, browser, or external API tools are exposed to the model.
- Prompts and responses are sent to the configured local inference server only; no cloud fallback is implemented.
- Conversation history is bounded; `:reset` clears it.
- A successful CLI response proves the local request/response path works, not that model outputs are correct or scientifically validated.

## Tests

```sh
node --test UnifiedField/TermuxAgent/agent.test.cjs
node --check UnifiedField/TermuxAgent/agent.cjs
```
