const webSocket = require('ws')
const net = require('net')

const webSocketServer = new webSocket.Server({"port":8080})

webSocketServer.on("connection", (stream)=>{

    console.log('A web browser connected to the proxy!')

    const tcpClient = net.createConnection({port:5000}, ()=>{
        console.log("Connected to the  TCP Server")
    })

    tcpClient.on("data", (data)=>{
        stream.send(data.toString()+'\n')
    })

    stream.on("message", (message)=>{
        tcpClient.write(`${message+'\n'}`)
    })

    stream.on("close", ()=>tcpClient.end())
    tcpClient.on("end", ()=>stream.close())
})

console.log(`webSocket Proxy Server listening on port: ${8080} `) 