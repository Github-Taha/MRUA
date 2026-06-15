#!/usr/bin/node

// MRUA - MasterRyped User Authentication

const http = require("http");
const fs = require("fs").promises;

const PORT = 8080;
const HOSTNAME = "127.0.0.1";

const USER_FILE_NAME = "users.json";
const SITESFOLDER = "sites/";

const TOKEN_EXPIRATION_TIME = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

const userTokens = {};

let currentUserIDCount = 0;

async function writeUser (user) {
    const users = await readUsers();

    users.push(user);

    try {
        fs.writeFile(USER_FILE_NAME, JSON.stringify(users), "utf-8");
    }
    catch (err) {
        console.error("An error occurred:", err.message);
        return err;
    }
}

async function updateUsers (users) {
    try {
        fs.writeFile(USER_FILE_NAME, JSON.stringify(users), "utf-8");
    }
    catch (err) {
        console.error("An error occurred:", err.message);
        return err;
    }
}

async function readUsers () {
    try {
        const fileData = await fs.readFile(USER_FILE_NAME, "utf-8");
        return JSON.parse(fileData);
    }
    catch (err) {
        console.error("An error occurred:", err.message);
        return err;
    }
}

async function readSite (site) {
    try {
        const fileData = await fs.readFile(SITESFOLDER + site, "utf-8");
        return fileData;
    }
    catch (err) {
        console.error("An error occurred:", err.message);
        return err;
    }
}

function generateToken (len) {
    let chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let final = "";

    for (let i = 0; i < len; i++) {
        final += chars[Math.floor(Math.random() * chars.length)];
    }

    return final;
}

// Rate Limiter
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 3;

const rateLimitStore = {};

function isRateLimited (ip) {
    const now = Date.now();

    if (!rateLimitStore[ip]) {
        rateLimitStore[ip] = [];
    }

    rateLimitStore[ip] = rateLimitStore[ip].filter((timestamp) => (now - timestamp) < WINDOW_MS);

    if (rateLimitStore[ip].length > MAX_REQUESTS) {
        return true;
    }

    rateLimitStore[ip].push(now);
    return false;
}

setInterval(
    () => {
        const now = Date.now();

        for (const ip in rateLimitStore) {
            rateLimitStore[ip] = rateLimitStore[ip].filter((timestamp) => (now - timestamp) < WINDOW_MS);
            if (rateLimitStore[ip].length ==  0) {
                delete rateLimitStore[ip];
            }
        }
    },
    WINDOW_MS
);


const server = http.createServer(
    async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*'); // Allows any website (including origin 'null')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authentication, cache-control, ngrok-skip-browser-warning');

        if (req.method === 'OPTIONS') {
            res.writeHead(204); // 204 -> "No Content"
            res.end();
            return;
        }

        const parsedURL = new URL(req.url, `http://${HOSTNAME}`);

        if (req.url === "/username" && req.method === "POST") {
            let body = "";

            req.on(
                "data",
                (chunk) => {
                    body += chunk;
                }
            );

            req.on(
                "end",
                async () => {
                    try {
                        const receivedData = JSON.parse(body);
                        console.log('Username is:', receivedData.username);

                        const users = await readUsers();

                        for (let i = 0; i < users.length; i++) {
                            if (users[i]["username"] === receivedData.username) {
                                res.writeHead(
                                    200, 
                                    {
                                        "Content-Type": "application/json"
                                    }
                                );
                                res.end(
                                    JSON.stringify(
                                        {
                                            status: "success",
                                            message: 'old'
                                        }
                                    )
                                );
                                return;
                            }
                        }

                        res.writeHead(
                            200, 
                            {
                                'Content-Type': 'application/json' 
                            }
                        );
                        res.end(
                            JSON.stringify(
                                {
                                    status: 'success',
                                    message: 'new' 
                                }
                            )
                        );

                    } 
                    catch (error) {
                        res.writeHead(
                            400, // Error Code
                            { 
                                'Content-Type': 'application/json' 
                            }
                        );
                        res.end(
                            JSON.stringify(
                                {
                                    status: 'error', 
                                    message: 'invalid' 
                                }
                            )
                        );
                    }
                }
            );

            return;
        }
        else if (req.url === "/signup" && req.method === "POST") {
            let body = "";

            req.on(
                "data",
                (chunk) => {
                    body += chunk;
                }
            );

            req.on(
                "end",
                async () => {
                    try {
                        let receivedData = JSON.parse(body);
                        console.log('Username is:', receivedData.username);
                        receivedData.id = currentUserIDCount;
                        currentUserIDCount ++;

                        const users = await writeUser(receivedData);

                        const token = generateToken(64);
                        console.log("Token: " + token);

                        userTokens[token] = {
                            id: receivedData.id,
                            createdAt: Date.now()
                        };

                        res.writeHead(
                            200, 
                            {
                                "Content-Type": "application/json"
                            }
                        );
                        res.end(
                            JSON.stringify(
                                {
                                    status: "success",
                                    message: "success",
                                    token: token
                                }
                            )
                        );

                    } 
                    catch (error) {
                        res.writeHead(
                            400, // Error Code
                            { 
                                'Content-Type': 'application/json' 
                            }
                        );
                        res.end(
                            JSON.stringify(
                                {
                                    status: 'error', 
                                    message: 'error' 
                                }
                            )
                        );
                    }
                }
            );

            return;
        }
        else if (req.url === "/login" && req.method === "POST") {
            // Rate Limiting
            const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            
            const now = Date.now();

            if (isRateLimited(clientIP)) {
                res.writeHead(429, { 
                    "Content-Type": "application/json",
                    "Retry-After": Math.ceil(WINDOW_MS / 1000)
                });
                res.end(JSON.stringify({
                    status: "success",
                    message: "tmreq",
                    retryAfter: Math.ceil((WINDOW_MS - (now - rateLimitStore[clientIP][0])) / 1000)
                }));
                return;
            }


            let body = "";

            req.on(
                "data",
                (chunk) => {
                    body += chunk;
                }
            );

            req.on(
                "end",
                async () => {
                    try {
                        const receivedData = JSON.parse(body);
                        console.log('Username is:', receivedData.username);

                        const users = await readUsers(receivedData);
                        const savedUser = users.find((user) => user.username === receivedData.username);

                        if (receivedData.password === savedUser.password) {
                            const token = generateToken(64);
                            console.log("Token: " + token);

                            userTokens[token] = {
                                id: savedUser.id,
                                createdAt: Date.now()
                            };

                            res.writeHead(
                                200, 
                                {
                                    "Content-Type": "application/json"
                                }
                            );
                            res.end(
                                JSON.stringify(
                                    {
                                        status: "success",
                                        message: "success",
                                        token: token
                                    }
                                )
                            );
                        }
                        else {
                            res.writeHead(
                                200, 
                                {
                                    "Content-Type": "application/json"
                                }
                            );
                            res.end(
                                JSON.stringify(
                                    {
                                        status: "success",
                                        message: "password"
                                    }
                                )
                            );
                        }


                    } 
                    catch (error) {
                        res.writeHead(
                            400, // Error Code
                            { 
                                'Content-Type': 'application/json' 
                            }
                        );
                        res.end(
                            JSON.stringify(
                                {
                                    status: 'error', 
                                    message: 'error' 
                                }
                            )
                        );
                    }
                }
            );

            return;
        }
        else if (req.url === "/check-token" && req.method === "GET") {
            const authHeader = req.headers['authentication'];
            console.log(req.headers);

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                console.log("Token: " + token);

                if (Object.keys(userTokens).includes(token)) {
                    res.writeHead(
                        200, 
                        {
                            "Content-Type": "application/json"
                        }
                    );
                    res.end(
                        JSON.stringify(
                            {
                                status: "success",
                                message: "success",
                            }
                        )
                    );
                }
                else {
                    res.writeHead(
                        200, 
                        {
                            "Content-Type": "application/json"
                        }
                    );
                    res.end(
                        JSON.stringify(
                            {
                                status: "success",
                                message: "invalid"
                            }
                        )
                    );
                }
            } 
            else {
                res.writeHead(
                    200, 
                    {
                        "Content-Type": "application/json"
                    }
                );
                res.end(
                    JSON.stringify(
                        {
                            status: "error",
                            message: "error"
                        }
                    )
                );
            }

            return;
        }
        else if (req.url === "/user-data" && req.method === "GET") {
            const authHeader = req.headers['authentication'];

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                console.log("Token: " + token);
                console.log("Need User Data");

                if (Object.keys(userTokens).includes(token)) {
                    const id = userTokens[token].id;
                    console.log("ID: " + id);

                    const users = await readUsers();
                    const user = users.find((user) => user.id === id);

                    const outJSON = {
                        status: "success",
                        message: "success",
                        data: {
                            username: user.username,
                            email: user.email
                        }
                    };

                    res.writeHead(
                        200, 
                        {
                            "Content-Type": "application/json"
                        }
                    );
                    res.end(
                        JSON.stringify(outJSON)
                    );


                    return;
                }
                else {
                    res.writeHead(
                        200, 
                        {
                            "Content-Type": "application/json"
                        }
                    );
                    res.end(
                        JSON.stringify(
                            {
                                status: "success",
                                message: "invalid"
                            }
                        )
                    );

                    return;
                }
            } 
            else {
                res.writeHead(
                    200, 
                    {
                        "Content-Type": "application/json"
                    }
                );
                res.end(
                    JSON.stringify(
                        {
                            status: "error",
                            message: "error"
                        }
                    )
                );
            }

            return;
        }
        else if (req.url === "/delete-user" && req.method === "POST") {
            const authHeader = req.headers['authentication'];

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                console.log("Token: " + token);
                console.log("Delete User");

                if (Object.keys(userTokens).includes(token)) {
                    const id = userTokens[token].id;
                    console.log("ID: " + id);

                    delete userTokens[token];

                    const users = await readUsers();
                    const userI = users.findIndex((user) => user.id === id);

                    users.splice(userI, 1);

                    await updateUsers(users);

                    res.writeHead(
                        200, 
                        {
                            "Content-Type": "application/json"
                        }
                    );
                    res.end(
                        JSON.stringify({
                            status: "success",
                            message: "deleted"
                        })
                    );


                    return;
                }
                else {
                    res.writeHead(
                        200, 
                        {
                            "Content-Type": "application/json"
                        }
                    );
                    res.end(
                        JSON.stringify(
                            {
                                status: "success",
                                message: "invalid"
                            }
                        )
                    );

                    return;
                }
            } 
            else {
                res.writeHead(
                    200, 
                    {
                        "Content-Type": "application/json"
                    }
                );
                res.end(
                    JSON.stringify(
                        {
                            status: "error",
                            message: "error"
                        }
                    )
                );
            }

            return;
        }
        else {
            const mainSite = await readSite("index.html");

            res.writeHead(
                200,
                {
                    "Content-Type": "text/html"
                }
            );
            res.end(mainSite);

            return;
        }

    }
);

function cleanExpiredTokens() {
    const now = Date.now();
    console.log(`[${new Date().toISOString()}] Running background cleanup for expired tokens...`);

    for (let i = Object.keys(userTokens).length - 1; i >= 0; i--) {
        const token = Object.keys(userTokens)[i];
        const createTime = userTokens[token].createdAt;
        
        if ((now - createTime) > TOKEN_EXPIRATION_TIME) {
            console.log("Deleted token: " + token);
            delete userTokens[token];
        }
    }
}

setInterval(cleanExpiredTokens, CLEANUP_INTERVAL);

// Set User ID
(async () => {
    const users = await readUsers();
    
    let maxID = 0;
    for (let i = 0; i < users.length; i++)
        if (users[i].id >= maxID)
            maxID = users[i].id + 1;
    
    currentUserIDCount = maxID;
    console.log("CurrentID: " + currentUserIDCount);
})();

server.listen(
    PORT,
    HOSTNAME,
    () => {
        console.log(`Server running at http://${HOSTNAME}:${PORT}`);
    }
);

