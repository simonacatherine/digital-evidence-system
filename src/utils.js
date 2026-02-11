const fs = require("fs");
const crypto = require("crypto");

function sha256File(filePath){
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
}

function nowISO(){
    return new Date().toISOString();
}

module.exports = {sha256File, nowISO};