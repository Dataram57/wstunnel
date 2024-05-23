//================================================================
//#region Requirements

const net = require('net');
const CryptoProfile = require('./lib_crypto.js');
let config; //= require('./config_SWTCP.json');
if(process.moduleConfigPath)
    config = require(process.moduleConfigPath);
else
    config = require('./config_SWTCP.json');

//#endregion

//================================================================
//#region Encryption & Decryption

//prepare superSecretKey
config.superSecretKey = Buffer.from(config.superSecretKey, 'hex');

//prepare profiles
const cryptoServer = new CryptoProfile(config.superSecretKey);
const cryptoClient = new CryptoProfile(config.superSecretKey);

//Scheme:
//1. Server sends seed (client is waiting for this seed)
//2. Client uses this seed, and sends his (server is waiting for this seed (not required for client to wait for))
//3. Server and Client can now start a conversation

//#endregion

//================================================================
//#region Init

const applicationType = "SWTCP";
let OriginalSend = function(){};
let Close = function(){};
const Init = (func_message, func_close) => {
    OriginalSend = func_message;
    Close = func_close;
};

const Send = message => {
    //Encryption here
    message = cryptoServer.Encrypt(message);
    //next key
    cryptoServer.NextKey();
    //send
    OriginalSend(message);
};

//#endregion

//================================================================
//#region Functions

let hasClientSeed = false;
let isClientWorking = false;
let client;

const KillClient = () => {
    isClientWorking = false;
    if(client)
        client.destroy();
    client = null;
};

const onStart = () => {
    //setup client
    isClientWorking = false;
    client = new net.Socket();

    //setup events
    client.connect(config.port, config.host, () => {
        //client ready
        isClientWorking = true;
        
        //reset crypto profiles
        cryptoServer.SetToBase();
        cryptoClient.SetToBase();
        //send server seed
        const seed = cryptoServer.GenerateRandomSeed(config.seedMinSize, config.seedMaxSize);
        Send(seed);     //encrypted with the base
        cryptoServer.SetSeed(seed);

        //setup message receivment
        client.on('data', (data) => {
            //forward encrypted message
            Send(data);
        });
    
        // Handle connection close
        client.on('close', () => {
            //close
            KillClient();
        });

        // Handle error
        client.on('error', (e) => {
            //debug
            console.log(e);
            //close
            KillClient();
        });
    });
};

const onMessage = (message) => {
    //decrypt message
    message = cryptoClient.Decrypt(message);
    //check seed
    if(!cryptoClient.isSeedApplied){
        cryptoClient.SetSeed(message);
        return; //skip forwarding the message
    }
    //calc next key
    cryptoClient.NextKey();
    
    //forward message to client
    if(isClientWorking){
        //forward
        client.write(message);
    }
};

const onEnd = () => {
    KillClient();
};

module.exports = {applicationType, Init, onStart, onMessage, onEnd};

//#endregion