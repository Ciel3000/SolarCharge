// src/mqtt-broker.js
// Local MQTT broker using Aedes
// Runs on port 1883 alongside the Express backend

const { createServer } = require('net');

let mqttServer = null;
let aedesInstance = null;

async function init() {
  const { Aedes } = await import('aedes');
  aedesInstance = new Aedes();

  // Error handling for the broker
  aedesInstance.on('error', (err) => {
    console.error('[MQTT Broker] Error:', err.message);
  });

  // Initialize Aedes broker internals (persistence, heartbeat, etc.)
  await aedesInstance.listen();

  mqttServer = createServer(aedesInstance.handle.bind(aedesInstance));

  const port = 1883;

  await new Promise((resolve, reject) => {
    mqttServer.listen(port, (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.error(`[MQTT Broker] Port ${port} already in use - another broker may be running`);
        console.error('[MQTT Broker] Please stop the other broker or change EMQX_PORT in .env');
        reject(new Error(`Port ${port} already in use`));
      } else if (err) {
        console.error(`[MQTT Broker] Failed to start on port ${port}:`, err);
        reject(err);
      } else {
        console.log(`[MQTT Broker] Local broker listening on port ${port}`);
        resolve();
      }
    });
  });

  // Log all published messages for debugging
  aedesInstance.on('publish', function (packet, client) {
    if (client) {
      console.log(`[MQTT Broker] Message from ${client.id} on topic: ${packet.topic}`);
    }
  });

  // Log client connections
  aedesInstance.on('client', function (client) {
    console.log(`[MQTT Broker] Client connected: ${client.id}`);
  });

  aedesInstance.on('clientDisconnect', function (client) {
    console.log(`[MQTT Broker] Client disconnected: ${client.id}`);
  });

  console.log('[MQTT Broker] Ready');
}

function close() {
  if (mqttServer) {
    console.log('[MQTT Broker] Closing...');
    mqttServer.close(() => {
      console.log('[MQTT Broker] Closed');
    });
    mqttServer = null;
  }
  if (aedesInstance) {
    aedesInstance.close(() => {
      console.log('[MQTT Broker] Aedes instance closed');
    });
    aedesInstance = null;
  }
}

module.exports = { init, close };
