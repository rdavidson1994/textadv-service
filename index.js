/*jshint esversion: 6*/
/*jshint node: true*/
const { promisify } = require("util");
const fs = require("fs");
const hogan = require("hogan.js");
const mustache = require("mustache");
const express = require("express");
const path = require("path");
const uuidv4 = require("uuid/v4");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
var read = require("read-yaml");
var config = read.sync("config.yml");
const app = express();

const dropdownTemplate = hogan.compile(
    fs.readFileSync("dropdown-template.mustache", "utf-8")
);

function publicAsset(string) {
    return path.join(__dirname, "public", string);
}

function debugLog(string) {
    if (config.debug) {
        console.log(string);
    }
}

var games = {};
var saves = {};

function saveFactory(saveId) {
    let save = {
        saveId: saveId,
        time: (new Date()).toUTCString()
    };
    return save;
}

function gameFactory(gameId, saveId) {
    let pyArgs = ["C:\\Users\\Rl\\Desktop\\textadv\\entrypoint.py", "-web"];
    if (saveId) {
        pyArgs.push(`--save=${saveId}`);
    }
    let game = {
        gameId: gameId,
        maxOutput: 0,
        outputs: [],
        partialOutputs: [],
        running: true,
        awaitingOutput: true,
        process: spawn("py", pyArgs)
    };
    game.process.stdout.on("data", async function (data) {
        let text = data.toString();
        debugLog(`Text from process: ${text}`);
        let lines = text.split("\n");
        for (line of lines) {
            if (line.startsWith("{")) {
                debugLog("Found JSON, parsing");
                let jsonData = JSON.parse(line);
                if (jsonData.type === "output complete") {
                    debugLog(`Got a push message from process. Outputs: ${game.partialOutputs}`)
                    let completeOutput = await Promise.all(game.partialOutputs);
                    debugLog(`Pushing these outputs ${completeOutput}`)
                    game.outputs.push(completeOutput.join(""));
                    game.partialOutputs = [];
                    if (jsonData.gameOver) {
                        game.running = false;
                    }
                } else {
                    game.partialOutputs.push(
                        //This pushes a Promise in.
                        game.handleGameSignal(jsonData)
                    );
                }
                //JSON data is meant for the server, and is not user-facing output
            } else {
                game.partialOutputs.push(line);
            }
        }
    });
    game.process.stderr.on("data", function (data) {
        debugLog(`Error from process: ${data}`);
        game.outputs.push(data);
        game.running = false;
    });
    game.nextOutput = function () {
        return game.outputs.length.toString();
    };
    game.writeLine = function (inputText) {
        game.process.stdin.write(inputText + "\n");
    };
    game.handleGameSignal = async function (jsonData) {
        let type = jsonData.type;
        if (type === "save") {
            debugLog("Save recorded");
            saveId = jsonData.saveId;
            saves[saveId] = saveFactory(saveId);
            return ""
        } else if (type === "dropdown") {
            debugLog("found a dropdown");
            //let template = await readFile("dropdown-template.mustache", "utf-8");
            debugLog("trying to render mustache template...");
            //let output = mustache.render(template, jsonData);
            debugLog("...template rendered, added.");
            return dropdownTemplate.render(jsonData);//output;
        }
    }
    return game;
};


app.use("/static", express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());


// Basic game-finding middleware
app.use("/Games/:gameId", function (req, res, next) {
    let game = games[req.params.gameId];
    if (!game) {
        res.status(404);
        res.send("Game not found.");
    } else if (!game.running && req.method !== "GET") {
        // Non-running games are read-only / GET-only
        res.status(403);
        res.send("Game over.");
    } else {
        req.game = game;
        next();
    }
});


// Root url -> main UI page
app.get("/", function (req, res) {
    res.sendFile(publicAsset("page.html"));
});

app.post("/Games", function (req, res) {
    debugLog("Game POST received...");
    let gameId = uuidv4();

    let saveId = req.body.saveId;
    if (saveId) {
        let save = saves[saveId];
        if (save) {
            games[gameId] = gameFactory(gameId, saveId);
        } else {
            res.status(404);
            res.send("Save not found");
        }
    }

    else {
        games[gameId] = gameFactory(gameId);
        res.location(`/Games/${gameId}`);
        res.json({
            self: `/Games/${gameId}`,
            gameId: gameId,
            outputLocation: `/Games/${gameId}/Outputs/0`
        });
    }
});

app.get("/Games/:gameId/Outputs/:outputId", function (req, res) {
    debugLog("Processing output request...");
    let index = req.params.outputId;
    debugLog(`Looking for this output index ${index}`);
    let output = req.game.outputs[index];
    if (output === undefined) {
        if (index <= req.game.maxOutput) {
            res.json({
                status: "in progress"
            });
        } else {
            debugLog("Sending 404");
            debugLog(`Next output is ${req.game.nextOutput()}, requested was ${index}`);
            res.status(404);
            res.send("Output not found");
        }
    } else {
        res.json({
            status: "complete",
            text: output
        });
    }

});

app.get("/Games/:gameId/Outputs", function (req, res) {
    res.json(req.game.outputs);
});

app.post("/Games/:gameId/Inputs", function (req, res) {
    debugLog(`received the following input request: ${JSON.stringify(req.body)}`);
    req.game.maxOutput += 1;
    /*let outputIndex = req.game.nextOutput();*/
    let inputText = req.body.inputText.replace(/[^a-zA-Z0-9 ]/g, "");
    req.game.writeLine(inputText);
    res.json({
        outputLocation: `/Games/${req.game.gameId}/Outputs/${req.game.maxOutput}`
    });

});

app.post("/Saves", function (req, res) {
    let game = games[req.body.gameId];
    if (!game) {
        res.status(404);
        res.send("Game not found");
    }
    game.writeLine("<<save>>");
    res.status(200);
    res.send("OK")
});

app.get("/Saves", function (req, res) {
    res.json(saves);
});

app.get("/Games", function (req, res) {
    res.json(games);
});

app.get("/Games/:gameId", function (req, res) {
    res.json(req.game);
});

app.listen(config.port, () => debugLog(`App listening on port ${config.port}.`));