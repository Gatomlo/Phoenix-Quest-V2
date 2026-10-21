// Petit hub Server-Sent Events générique : des "canaux" nommés (un par
// session pour le tableau de bord admin, un par équipe pour le chat/
// déblocage côté app joueur), chacun avec ses abonnés (réponses HTTP
// maintenues ouvertes).

const channels = new Map(); // channelKey -> Set<res>

function subscribe(channelKey, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(':ok\n\n');

  if (!channels.has(channelKey)) channels.set(channelKey, new Set());
  channels.get(channelKey).add(res);

  // Garde la connexion vivante à travers les proxys qui coupent les
  // connexions HTTP inactives.
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 25000);

  res.req.on('close', () => {
    clearInterval(heartbeat);
    channels.get(channelKey)?.delete(res);
    if (channels.get(channelKey)?.size === 0) channels.delete(channelKey);
  });
}

function publish(channelKey, eventName, data) {
  const subscribers = channels.get(channelKey);
  if (!subscribers || subscribers.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  subscribers.forEach((res) => res.write(payload));
}

module.exports = { subscribe, publish };
