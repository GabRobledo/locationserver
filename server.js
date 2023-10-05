const { MongoClient } = require('mongodb');
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);


const connectionUri = 'mongodb+srv://cravewolf:fBQcL0gSMNpOw0zg@cluster0.manlfyy.mongodb.net/?retryWrites=true&w=majority';





const userSessions = new Map();

let mongoClient;


function updateSessionActivity(sessionId) {
  const currentTime = Date.now();
  const session = userSessions.get(sessionId);
  if(session){
  session.lastActivityTime = currentTime;
  console.log(session, "getSession")
  userSessions.set(sessionId, session);
  }
}

// Function to check and update the session status
async function checkSessionStatus() {
  console.log(userSessions, "sessions")
  const currentTime = Date.now();

  const expiredSessions = [];

  for (const [sessionId, session] of userSessions.entries()) {
    const timeElapsed = currentTime - session.lastActivityTime;
    console.log(currentTime , session.lastActivityTime, "time")
    if (timeElapsed > 20000) {
      // Mark the session as expired
      expiredSessions.push(sessionId);
      // Emit the logout event to the specific client associated with the session
      // io.to(sessionId).emit('logout');

      if (session.role === 'Driver') {
        // Emit the event to all users with the role 'Mechanic'
        console.log("emitting to mechanicUserStatusUpdate")
        io.sockets.emit('mechanicUserStatusUpdate', { userId: sessionId, isLogged: false });
      }
       if (session.role === 'Mechanic') {
        console.log("emitting to driverUserStatusUpdate")
        // Emit the event to all users with the role 'Driver'
        io.sockets.emit('driverUserStatusUpdate', { userId: sessionId, isLogged: false });
      }
    }
  }
  console.log(expiredSessions, "es")
  if (expiredSessions.length > 0) {
    // Update the user statuses to 'isLogged: false' in MongoDB
    await updateUserStatusInDb(expiredSessions, false);
    // Remove the expired sessions from the userSessions map
    for (const sessionId of expiredSessions) {
      userSessions.delete(sessionId);
    }
  }
}

// Function to update the user statuses in MongoDB
async function updateUserStatusInDb(sessionIds, isLogged) {
  try {
    const collection = mongoClient.db().collection('users');

    await collection.updateMany(
      { _id: { $in: sessionIds } },
      { $set: { isLogged: isLogged } }
    );
    
  } catch (error) {
    console.error('Error updating user statuses in MongoDB:', error);
  }
}

async function saveMessageToMongo(message) {
  try {
    const collection = mongoClient.db().collection('messages');
    await collection.insertOne(message);
  } catch (error) {
    console.error('Error saving message to MongoDB:', error);
  }
}


io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('message', async (data) => {
    // Create a message object
    const message = {
      sender: data.sender, // Replace with the actual sender information
      content: data.content, // Replace with the actual message content
      timestamp: new Date(),
      chatRoomId: data.chatRoomId, // Replace with the appropriate chat room ID
    };
  
    // Save the message to MongoDB
    await saveMessageToMongo(message);
  
    // Broadcast the message to all connected clients
    io.emit('message', message);
  });
  
});

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('mechanicLocationUpdate', (data) => {
    console.log(data, "mechannicupdate")
    // Broadcast the location update to all mechanic roles'
       
    io.sockets.emit('driverLocationUpdate', data);
    // if(!userSessions.get(data.userId)){
    //   data.isLogged = true
    //   userSessions.set(data.userId, data);
    //   io.sockets.emit('driverUserStatusUpdate', data);   
    //   }
      updateSessionActivity(data.userId)

  });

  socket.on('mechanicUserStatusUpdate', (data) => {
 
    console.log(data, "mechannistatuscupdate")
    if(!userSessions.get(data.userId)){
    userSessions.set(data.userId, data);
    io.sockets.emit('driverUserStatusUpdate', data); 
    }
    updateSessionActivity(data.userId)
    // Broadcast the location update to all mechanic roles                                          
  });


  socket.on('driverLocationUpdate', (data) => {
    console.log(data, "driverLocationUpdate")

    io.sockets.emit('mechanicLocationUpdate', data);
    //  if(!userSessions.get(data.userId)){
    // data.isLogged = true
    // userSessions.set(data.userId, data);
    // io.sockets.emit('mechanicUserStatusUpdate', data);
    // }
    updateSessionActivity(data.userId)
      
    // Broadcast the location update to all mechanic roles

  });

  
  socket.on('driverUserStatusUpdate', (data) => {

    console.log(data, "driverStatusUpdate")
    // Broadcast the location update to all mechanic roles
    if(!userSessions.get(data.userId)){
      userSessions.set(data.userId, data);
      io.sockets.emit('mechanicUserStatusUpdate', data);
      }
    updateSessionActivity(data.userId)
  });


  socket.on('disconnect', () => {
    console.log(`Client disconnected`);
  });
});

async function connectToMongo() {
  try {
    mongoClient = await MongoClient.connect(connectionUri, { useNewUrlParser: true });
    console.log('Connected to MongoDB successfully!');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}



setInterval(() => {

  checkSessionStatus();
  
}, 10000);


const port = 3000;
server.listen(port, async() => {
  await connectToMongo();
  console.log(`Server is running on port ${port}`);
});


