const express = require('express');
const path = require('path');
const uuidv4 = require('uuid/v4')
const bodyParser = require('body-parser')
const { spawn } = require('child_process');

const app = express();
const port = 80;
const publicAsset = (string) => {
    return path.join(__dirname, 'public', string);
}

var processes = {};
var outputs = {};

app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.sendFile(publicAsset('page.html'));
});

app.post('/NewProcess', function (req, res) {
    console.log("made a process")
    processId = uuidv4()
    child = spawn('py', ['C:\\Users\\Rl\\Desktop\\textadv\\world.py', 'web'])
    //child = spawn('py', ['-i', 'C:\\Users\\Rl\\Desktop\\textadv\\test.py', 'web'])
    //child = spawn('py', ['-i'])
    processes[processId] = child
    outputs[processId] = []
    child.stdout.on('data', function (data) {
        console.log(`Data from process: ${data.toString()}`);
        outputs[processId].push(data)
    });
    child.stderr.on('data', function (data) {
        console.log(`Error from process: ${data}`)
        outputs[processId].push(data)
    });
    console.log("spawned ok")
    res.send(JSON.stringify({ processId: processId }));
});

app.post('/ValidateProcess', function (req, res) {
    console.log("validating process")
    res.send(JSON.stringify({ valid: false }))
})

app.post('/TextInput', function (req, res) {
    console.log(`received input: ${JSON.stringify(req.body)}`)
    console.log(`processId was: ${req.body.processId}`)
    console.log(`inputText was: ${req.body.inputText}`)
    child = processes[req.body.processId]
    child.stdin.write(req.body.inputText + "\n");
    //child.send(req.body.inputText + "\n")
    console.log("wrote succesffully")

    res.send(JSON.stringify({ inProgress: true }))
});

app.post('/OutputPoll', function (req, res) {
    console.log("Poll received:")
    processId = req.body.processId;
    if (outputs[processId].length !== 0) {
        output = outputs[processId].join("\n");
        outputs[processId] = [];
        console.log(`sending update: ${output}`)
        res.send(JSON.stringify({ text: output }));
    } else {
        res.send(JSON.stringify({ inProgress: true }))
        console.log("no updates to report")
    }
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));