const COLORS = ['red', 'blue', 'yellow', 'green'];
const START = { red: 0, blue: 13, yellow: 26, green: 39 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function createGame(players) {
  return { players: players.map((p, i) => ({ ...p, color: COLORS[i], tokens: [-1, -1, -1, -1] })), turn: 0, pendingRoll: null, lastRoll: null, winner: null, message: 'Roll a six to bring a token onto the board.' };
}
function legalTokens(game) {
  if (!game || game.pendingRoll == null || game.winner !== null) return [];
  const tokens = game.players[game.turn].tokens;
  return tokens.map((p, i) => (p === -1 ? game.pendingRoll === 6 : p < 57 && p + game.pendingRoll <= 57) ? i : -1).filter(i => i >= 0);
}
function rollGame(game, die = Math.floor(Math.random() * 6) + 1) {
  const next = structuredClone(game); next.pendingRoll = die; next.lastRoll = die;
  const eligible = legalTokens(next);
  next.message = eligible.length ? `${next.players[next.turn].name}, choose a token to move.` : `${next.players[next.turn].name} has no legal move.${die === 6 ? ' Roll again for the six.' : ' Turn passes.'}`;
  if (!eligible.length) advance(next, die === 6);
  return next;
}
function moveGame(game, tokenIndex) {
  const next = structuredClone(game); const die = next.pendingRoll;
  if (!legalTokens(next).includes(tokenIndex)) return next;
  const player = next.players[next.turn]; const old = player.tokens[tokenIndex];
  player.tokens[tokenIndex] = old === -1 ? 0 : old + die;
  const moved = player.tokens[tokenIndex]; let captures = 0;
  if (moved < 52) {
    const square = (START[player.color] + moved) % 52;
    if (!SAFE.has(square)) next.players.forEach((other, pi) => {
      if (pi === next.turn) return;
      other.tokens = other.tokens.map(pos => {
        if (pos >= 0 && pos < 52 && (START[other.color] + pos) % 52 === square) { captures++; return -1; }
        return pos;
      });
    });
  }
  const won = player.tokens.every(pos => pos === 57);
  next.pendingRoll = null;
  if (won) { next.winner = next.turn; next.message = `${player.name} wins the game!`; }
  else {
    const bonus = die === 6 || captures > 0 || moved === 57;
    next.message = captures ? `Capture! ${player.name} gets another roll.` : bonus ? `${player.name} gets another roll.` : 'Turn complete.';
    advance(next, bonus);
  }
  return next;
}
function advance(game, bonus) { game.pendingRoll = null; if (!bonus) game.turn = (game.turn + 1) % game.players.length; }
function squareFor(color, progress) { return progress >= 0 && progress < 52 ? (START[color] + progress) % 52 : null; }
module.exports = { COLORS, START, SAFE, createGame, legalTokens, rollGame, moveGame, squareFor };
