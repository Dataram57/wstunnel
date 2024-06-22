# wstunnel

This is a tunneling tool that allows you to tunnel network applications through a tunnel based on WebSocket protocol.

# Requirements

- NodeJS and NPM
- Public and addressable server that can run NodeJS application.

## How does it work?

General Scheme:
```
Private Server    <----->    Relay Server    <----->    Client
```

- `Private Server` establishes a connection between the `Relay Server` and is the machine which runs the desired network application that you want to tunnel (example: HTTP server, SSH server, RTSP media stream, etc...).
- `Relay Server` allows to communicate with the `Client` and his `Private Server` through WebSocket connections.
- `Client` communicates with the `Private Server` over the `Relay Server` to properly communicate with the other running client's application (example: Web Browser, SSH, VLC, etc...).

Detail Scheme:
```
App_A  <---->  tunnel.js  <---->  server_realy.js  <---->  client_app  <---->  App_B
```

# Exmaple Setup - `SWTCP_2`

## What is `SWTCP_2`?
`SWTCP_2` (Securely Wrapped TCP) is a sub-protocol that can tunnel any TCP application running on a specific port, through the wstunnel. It is a upgraded and much more safe version of the `SWTCP` which couldn't handle multiple TCP sockets.

## `Relay Server`

...wip

### `Client - Relay Server Panel`

...wip

## `Tunnel`

...wip

## `Client`

...wip

# All Sub-Protocols

| Name |  Private Server | Client | Description |
| :--: | :--: | :--: | :--: |
| `TEST` | `interface_TEST.js` | `client/TEST` | a |
| `SWSSH` | `interface_SWSSH.js` <br> Install: `ssh2` <br> Configure: `config_SWSSH.json` | `client/SWSSH` <br> Install: `xterm` <br> Configure: `config.js`  | a |
| `TCP` | `interface_TCP.js` <br> Configure: `config_TCP.json` | `client_TCP/client_TCP.js` <br> Install: `ws` <br> Configure: `config.json` | a |
| `SWTCP` | `interface_SWTCP.js` <br> Configure: `config_SWTCP.json` | `client_SWTCP/client_SWTCP.js` <br> Install: `ws` <br> Configure: `config.json` | a |
| `SWTCP_2` | `interface_SWTCP_2.js` <br> Configure: `config_SWTCP_2.json` | `client_SWTCP/client_SWTCP_2.js` <br> Install: `ws` <br> Configure: `config.json` | a |