const express = require('express');
const path = require('path');
const url = require('url');
const uuidv4 = require('uuid/v4');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const session = require('express-session');
var read = require('read-yaml');
var config = read.sync('config.yml');

const app = express();
const port = config['port'];
function publicAsset(string) {
    return path.join(__dirname, 'public', string);
}

function debugLog(string) {
    if (config.debug) {
        console.log(string)
    }
};

var games = {};
var saves = {};


function saveFactory(saveId) {
    save = {
        saveId: saveId,
        time: (new Date()).toUTCString()
    }
    return save
}

function gameFactory(gameId, saveId) {
    pyArgs = ['C:\\Users\\Rl\\Desktop\\textadv\\entrypoint.py', '-web']
    if (saveId) {
        pyArgs.push(`--save=${saveId}`)
    }
    game = {
        gameId: gameId,
        outputs: [],
        partialOutputs: [],
        running: true,
        awaitingOutput: true,
        process: spawn('py', ['C:\\Users\\Rl\\Desktop\\textadv\\entrypoint.py', '-web'])
    }
    game.process.stdout.on('data', function (data) {
        text = data.toString()
        debugLog(`Text from process: ${text}`);
        lines = text.split("\r\n");
        lines.forEach(function (line) {
            if (line.startsWith("{")) {
                debugLog("Found JSON, parsing");
                jsonData = JSON.parse(line);
                game.handleGameSignal(jsonData);
                //JSON data is meant for the server, and is not user-facing output
            } else {
                game.partialOutputs.push(line);
            }
        })
    });
    game.process.stderr.on('data', function (data) {
        debugLog(`Error from process: ${data}`);
        game.outputs.push(data);
        game.running = false;
    });
    game.nextOutput = function () {
        return game.outputs.length.toString();
    }
    game.writeLine = function (inputText) {
        game.process.stdin.write(inputText + "\n");
    }
    game.handleGameSignal = function (jsonData) {
        if (jsonData.type === "save") {
            debugLog("Save recorded");
            saveId = jsonData.saveId;
            saves[saveId] = saveFactory(saveId);
        } else if (jsonData.type === "output complete") {
            game.outputs.push(game.partialOutputs.join(""));
            game.partialOutputs = [];
            if (jsonData.gameOver) {
                game.running = false;
            }
        }
    }
    return game;
}

app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());


// Basic game-finding middleware
app.use('/Games/:gameId', function (req, res, next) {
    game = games[req.params.gameId]
    if (!game) {
        res.status(404);
        res.send("Game not found.")
    } else if (!game.running && req.method !== "GET") {
        // Non-running games are read-only / GET-only
        res.status(403);
        res.send("Game over.")
    } else {
        req.game = game;
        next();
    }
})


// Root url -> main UI page
app.get('/', function (req, res) {
    res.sendFile(publicAsset('page.html'));
});

app.post('/Games', function (req, res) {
    debugLog("Game POST received...")
    gameId = uuidv4()
    games[gameId] = gameFactory(gameId);

    res.location(`/Games/${gameId}`);
    res.json({
        self: `/Games/${gameId}`,
        gameId: gameId,
        outputLocation: `/Games/${game.gameId}/Outputs/0`
    });
});

app.get('/Games/:gameId/Outputs/:outputId', function (req, res) {
    debugLog("Processing output request...")
    index = req.params.outputId;
    debugLog(`Looking for this output index ${index}`)
    output = req.game.outputs[index]
    if (!output) {
        if (index === req.game.nextOutput()) {
            res.json({
                status: "in progress"
            })
        } else {
            debugLog("Sending 404")
            debugLog(`Next output is ${req.game.nextOutput()}, requested was ${index}`)
            res.status(404);
            res.send("Output not found");
        }
    } else {
        res.json({
            status: "complete",
            text: output
        })
    }

});

app.get('/Games/:gameId/Outputs', function (req, res) {
    res.json(req.game.outputs);
});

app.post('/Games/:gameId/Inputs', function (req, res) {
    debugLog(`received the following input request: ${JSON.stringify(req.body)}`)
    game = req.game;
    outputIndex = game.nextOutput();
    inputText = req.body.inputText.replace(/[^a-zA-Z0-9 ]/g, '');
    game.writeLine(inputText);
    res.json({
        outputLocation: `/Games/${game.gameId}/Outputs/${outputIndex}`
    });

});

app.post('/Saves', function (req, res) {
    game = games[req.body.gameId]
    if (!game) {
        res.status(404);
        res.send("Game not found")
    }
    game.writeLine("<<save>>")
    res.send()
});

app.get('/Saves', function (req, res) {
    res.json(saves)
});

app.get('/Games', function (req, res) {
    res.json(games)
});

app.get('/Games/:gameId', function (req, res) {
    res.json(req.game)
});

app.listen(port, () => debugLog(`App listening on port ${port}.`));