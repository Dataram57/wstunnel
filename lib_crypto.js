//================================================================
//#region Requirements

const {createCipheriv, createDecipheriv, createHash, randomBytes} = require('crypto');

//#endregion

//================================================================
//#region Encryption & Decryption

//Just a useful function
const Hash_SHA256 = (input) => createHash('sha256').update(input).digest();

//Object that predicts the next key, and allows to encrypt and decrypt a message with it
//Scheme:
//1. Server sends his seed (waits for client to respond)
//2. Client sends his seed
//3. Client and Server know their seeds so they can talk now.
const CryptoProfile = class{
    constructor(base){
        this.base = base;
        this.key = Buffer.alloc(32);
        this.isSeedApplied = false;
        //AES only
        this.iv = Buffer.alloc(16);
    }

    SetToBase(){
        this.isSeedApplied = false;
        this.key = Buffer.alloc(0);
        this.NextKey();
    }

    GenerateRandomSeed(minLength, maxLength){
        return randomBytes(minLength + Math.floor(Math.random() * (maxLength - minLength + 1)));
    }

    SetSeed(seed){
        this.isSeedApplied = true;
        this.key = seed;
        this.NextKey();
    }

    NextKey(){
        //calculate the next key that the profile will use
        this.key = Hash_SHA256(Buffer.concat([this.base, this.key]));
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

//#endregion

module.exports = CryptoProfile;