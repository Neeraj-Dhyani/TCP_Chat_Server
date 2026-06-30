const net = require("net")
const {faker} = require('@faker-js/faker')

const clients = new Set()
let clientNum = 1
const server = net.createServer((connection)=>{
    // console.log(conection)
    // console.log(client)
    clientNum += 1;
    clients.add(connection)
    console.log(`client ${clientNum} connected!`)
    console.log(`totle client: ${clientNum}`)
    connection.write("Welcome to the FICS-style Chat Server!\n")
    connection.username = faker.internet.username()
    
   

    connection.on('data', (data)=>{
        // const message = data.toString()
        for(let client of clients ){
            if(client !== connection){
                client.write(`${connection.username}:${data.toString()}`)
            }else{
                client.write(`You:${data.toString()}`)
            }
        }
    })
  
    
    connection.on("end", ()=>{
        clientNum-=1
        clients.delete(connection)
        console.log(`client disconnected totle client: ${clientNum}`)
        
    })

})

server.listen(5000, () => {
  console.log('TCP server listening on port 5000');
});