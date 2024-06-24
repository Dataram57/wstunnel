# wstunnel

This is a tunneling tool that allows you to tunnel network applications through a tunnel based on WebSocket protocol.

# Requirements

- NodeJS and NPM
- Public and addressable server that can run NodeJS application.

## How does it work?

### General Scheme:
```
Private Server    <----->    Relay Server    <----->    Client
```

- `Private Server` establishes a connection between the `Relay Server` and is the machine which runs the desired network application that you want to tunnel (example: HTTP server, SSH server, RTSP media stream, etc...).
- `Relay Server` allows to communicate with the `Client` and his `Private Server` through WebSocket connections.
- `Client` communicates with the `Private Server` over the `Relay Server` to properly communicate with the other running client's application (example: Web Browser, SSH, VLC, etc...).

### Detail Scheme:
```
App_A  <---->  tunnel.js  <---->  server_realy.js  <---->  client_app  <---->  App_B
```
### Schizo Scheme:
![](https://dataram57.com/static-imgs/VFUIGNRO5V.jpg)

# Exmaple Setup - `SWTCP_2`

## What is `SWTCP_2`?
`SWTCP_2` (Securely Wrapped TCP) is a sub-protocol that can tunnel any TCP application running on a specific port, through the wstunnel. It is a upgraded and much more safe version of the `SWTCP` which couldn't handle multiple TCP sockets.

## First Steps
Run Shell or PowerShell, and cd to the wstunnel directory:
```
cd
git clone https://github.com/Dataram57/wstunnel.git
cd wstunnel
```

## `Relay Server`
Run these commands in your Shell or PowerShell and paste:
```
mkdir deploy
mkdir deploy/server_relay
cp ./server_relay.js ./deploy/server_relay/server_relay.js
cp ./config_relay.json.template ./deploy/server_relay/config_relay.json
cd ./deploy/server_relay
npm init -y
npm i ws
```

*This will create a `Relay Server` package.*

Edit `config_relay.json`, and adjust the config to your needs. This tutorial will leave everything as it is.

Run the `Relay Server`:
```
node ./server_relay.js
```

## `Client - Relay Server Panel` (*Optional*)

This part is optional, however setting up this panel may save you help you manage your tunnels in the future.

Start again at the `/wstunnel` path and paste:
```
cp -r ./client/ ./deploy/
cd ./deploy/client
mv ./config.js.template ./config.js
```

*This will create a `Client` special panel package.*

Edit `config.js`, and adjust the config to your needs. This tutorial will leave everything as it is.

To run the panel just open `index.html` file in your browser. You should see empty table for now. Refresh the page to check if the `Relay Server` has any `Private Server` connected.

## `Tunnel`

Go back to the `/wstunnel` path and paste:
```
mkdir deploy/tunnel
cp ./tunnel.js ./deploy/tunnel/tunnel.js
cp ./lib_crypto.js ./deploy/tunnel/lib_crypto.js
cp ./config_tunnel.json.template ./deploy/tunnel/config_tunnel.json
cp ./interface_SWTCP_2.js ./deploy/tunnel/interface_SWTCP_2.js
cp ./config_SWTCP_2.json.template ./deploy/tunnel/config_SWTCP_2.json
cd ./deploy/tunnel
npm init -y
npm i ws
```

*This will create a `Private Server` package.*

Edit `config_tunnel.json`, and adjust the config to your needs. This tutorial will leave everything as it is.

Do the same with `config_SWTCP_2.json`.

Run the tunnel to the `Private Server`:
```
node ./tunnel.js
```

## `Client`

Start again at the `/wstunnel` path and paste:
```
cp -r ./client_SWTCP_2/ ./deploy/
cd ./deploy/client_SWTCP_2
mv ./config.json.template ./config.json
npm init -y
npm i ws
```

*This will create a `Client` package.*

Edit `config.json`, and adjust the config to your needs. This tutorial will leave everything as it is.

Run the `Client`:
```
node ./client_SWTCP_2.js
```
## Testing

So, if you have left every config as it was, and have run the `Private Server` tunnel, `Relay Server` and the `Client`, then you should be able visit the same server running on `localhost:80` at `localhost:5757` on the same machine.

# All Sub-Protocols

| Name |  Private Server | Client | Description |
| :--: | :--: | :--: | :--: |
| `TEST` | `interface_TEST.js` | `client/TEST` | Will send you back the same message it has received through WS. |
| `SWSSH` | `interface_SWSSH.js` <br> Install: `ssh2` <br> Configure: `config_SWSSH.json` | `client/SWSSH` <br> Install: `xterm` <br> Configure: `config.js`  | Pseudo SSH... This is just a tunneled terminal (SSH Client). |
| `TCP` | `interface_TCP.js` <br> Configure: `config_TCP.json` | `client_TCP/client_TCP.js` <br> Install: `ws` <br> Configure: `config.json` | Tunnels single TCP for a specific port socket. |
| `SWTCP` | `interface_SWTCP.js` <br> Configure: `config_SWTCP.json` | `client_SWTCP/client_SWTCP.js` <br> Install: `ws` <br> Configure: `config.json` | Tunnels single TCP sockets for a specific port using symmetric encryption. |
| `SWTCP_2` | `interface_SWTCP_2.js` <br> Configure: `config_SWTCP_2.json` | `client_SWTCP/client_SWTCP_2.js` <br> Install: `ws` <br> Configure: `config.json` | Tunnels multiple TCP sockets for a specific port using symmetric encryption. |