//================================================================
//#region Requirements

const config = require('./config_SWSSH.json');
const { Client } = require('ssh2');
const {createCipheriv, createDecipheriv, createHash, randomBytes} = require('crypto');

//#endregion

//================================================================
//#region Encryption & Decryption

//prepare superSecretKey
config.superSecretKey = Buffer.from(config.superSecretKey, 'hex');

//Just a useful function
const Hash_SHA256 = (input) => createHash('sha256').update(input).digest();

//Object that predicts the next key, and allows to encrypt and decrypt a message with it
//Made to protect SSH messages
//1. Server sends his seed (waits for client to respond)
//2. Client sends his seed (waits for server to respond)
//3. Server launches the application
const CryptoProfile = class{
    constructor(){
        this.key = Buffer.alloc(32);
        //AES only
        this.iv = Buffer.alloc(16);
    }

    SetToBase(){
        this.key = Buffer.alloc(0);
        this.NextKey();
    }

    SetSeed(seed){
        this.key = seed;
        this.NextKey();
    }

    NextKey(){
        //calculate the next key that the profile will use
        this.key = Hash_SHA256(Buffer.concat([config.superSecretKey, this.key]));
        //AES only
        this.iv = Hash_SHA256(this.key).subarray(0, 16);
    }

    Encrypt(message){
        //create cipher
        const cipher = createCipheriv('aes-256-gcm', this.key, this.iv);
        //encrypt
        const result = cipher.update(message);
        cipher.final();
        //return with Tag info
        return Buffer.concat([result, cipher.getAuthTag()]);
    }

    Decrypt(message){
        //create decipher
        const decipher = createDecipheriv('aes-256-gcm', this.key, this.iv);
        //remove authTag
        const tag = message.subarray(message.length - 16);
        message = message.subarray(0, message.length - 16);
        //decrypt
        const result = decipher.update(message);
        //return result
        return result;
    }
};

const cryptoServer = new CryptoProfile();
const cryptoClient = new CryptoProfile();

//#endregion

//================================================================
//#region Init

const applicationType = "SWSSH"
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

const StringBackspace = txt => txt.substring(0, txt.length - 1);

const onStart = () => {
    //reset crypto profiles
    cryptoServer.SetToBase();
    cryptoClient.SetToBase();
    //wait for seed
    state = -1;
    //generate seed
    const seed = randomBytes(config.seedMinSize + Math.floor(Math.random() * (config.seedMaxSize - config.seedMinSize + 1)));
    //send seed
    Send(seed);
    //use seed next time
    cryptoServer.SetSeed(seed);
};

const Intro = () => {
    if(state != 1){
        state = 1;
        username = '';
        password = '';
        Send("\n\rInput username: ");
    }
}; 

//temp vars
let i = 0;
let f = 0;
let key = 0;
let temp = '';

const onMessage = (message) => {
    //decrypt message
    message = cryptoClient.Decrypt(message);
    //calc next key
    cryptoClient.NextKey();
    //login and password input
    if(state == 1 || state == 2){
        //scan through each character
        f = message.length;
        i = -1;
        temp = '';
        while(++i < f){
            //get key
            key = message[i];
            //check if special key
            if(key == 13){
                //enter (carriage return)
                //next state
                if(state == 1){
                    temp += "\n\rInput password: ";
                    state = 2;
                }
                else{
                    //connect
                    temp += "\n\rConnecting to the SSH server...";
                    state = 0;
                    ReconnectSSH();
                }
            }
            else if(key == 127){
                //but only if possible
                if(((state == 1) ? username.length : password.length) > 0){
                    //Send cut data
                    temp = StringBackspace(temp);
                    Send(temp);
                    Send("\b\x1B[K\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00");
                    //clean current data
                    temp = '';
                    //change input
                    if(state == 1)
                        username = StringBackspace(username);
                    else
                        password = StringBackspace(password);
                }
            }
            else{
                //add key
                if(state == 1){
                    temp += String.fromCharCode(key);
                    username += message;
                }
                else{
                    temp += '*';
                    password += message;
                }
            }

        }
        //send input back
        Send(temp);
    }
    else if(state == -1){
        //apply client seed
        cryptoClient.SetSeed(message);
        //Start application
        Intro();
    }
    else if(ssh){
        if(sshStream){
            sshStream.write(message);
        }
    }
};

const onEnd = () => {
    state = -1;
};

module.exports = {applicationType, Init, onStart, onMessage, onEnd};

//#endregion

//================================================================
//#region SSH client

let state = -1;
//-1 - waiting for seed(used for encryption)
//0 - none / waiting
//1 - input username
//2 - input password
let username = '';
let password = '';
let ssh = null;
let sshStream = null;

const CloseSSH = () => {
    if(ssh){
        ssh.end();
        ssh.destroy();
        ssh = null;
    }
    if(sshStream){
        sshStream = null;
    }
    Intro();
};

const ReconnectSSH = () => {
    ssh = new Client();
    //setup events

    ssh.on('ready', () => {
        ssh.shell((err, stream) => {
            //error
            if (err){
                console.log(err);
                CloseSSH();
                return;
            }
            //apply stream
            sshStream = stream;
            SetupSSHstream();
        });
    });

    ssh.on('error', (err) => {
        //console.error('SSH connection error:', err);
        Send("\n\rError: " + err.name + "\n\rLevel: " + err.level + "\n\rDescription: " + err.description);
        CloseSSH();
    });
      
    ssh.on('end', () => {
        CloseSSH();
    });

    //connect
    ssh.connect({
        host: config.host
        ,port: config.port
        ,username: username
        ,password: password
    });
};

const SetupSSHstream = () => {
    sshStream.on('close', () => {
        CloseSSH();
    });

    sshStream.on('data', (data) => {
        Send(data);
    });

    sshStream.on('error', (err) => {
        console.error('SSH stream error:', err);
        CloseSSH();
    });
};

//#endregion