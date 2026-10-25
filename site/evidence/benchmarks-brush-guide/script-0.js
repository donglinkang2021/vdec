/* Teaching controller, parity-tested against the Python Brush environment. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const axes = ['x', 'y'];
  const relations = {x: ['left', 'same', 'right'], y: ['above', 'same', 'below']};
  function interval(position, bounds, relation, axis = 'x') {
    const next = {...bounds};
    if (next.locked || !relations[axis].includes(relation)) throw Error('Invalid or already locked axis');
    if (relation === 'same') return {position, bounds: {...next, locked: true}, exhausted: false};
    if (relation === relations[axis][0]) next.high = Math.min(next.high, position - 1);
    else next.low = Math.max(next.low, position + 1);
    const exhausted = next.low > next.high;
    return {position: exhausted ? position : Math.floor((next.low + next.high) / 2), bounds: next, exhausted};
  }
  function initial(c, inkMode = 'line_tool', maxSteps = 40) {
    return {case: clone(c), inkMode, maxSteps, phase: 'idle', pen: [...c.pen], anchor: null,
      stroke: [], steps: 0, terminal: null, invalid_actions: 0,
      intervals: {x: {low: 0, high: c.size - 1, locked: false}, y: {low: 0, high: c.size - 1, locked: false}}};
  }
  function target(s) { return ['drawing', 'finished'].includes(s.phase) ? s.case.end : s.case.start; }
  function activeAxes(s) { return axes.filter(a => !s.intervals[a].locked); }
  function snapshot(s) {
    return {phase: s.phase, target: ['drawing', 'finished'].includes(s.phase) ? 'E' : 'S',
      locked_axes: axes.filter(a => s.intervals[a].locked), steps_remaining: s.maxSteps - s.steps,
      pen: clone(s.pen), anchor: clone(s.anchor), stroke: clone(s.stroke), steps: s.steps,
      terminal: s.terminal, invalid_actions: s.invalid_actions, intervals: clone(s.intervals)};
  }
  function oracleAction(s) {
    if (s.phase === 'idle') return 'pick';
    if (s.pen.every((v, i) => v === target(s)[i])) return s.phase === 'lifted' ? 'drop' : 'pick';
    return 'move';
  }
  function oracleRelations(s, requested = activeAxes(s)) {
    return Object.fromEntries(requested.map(a => {
      const i = axes.indexOf(a);
      return [a, relations[a][Math.sign(target(s)[i] - s.pen[i]) + 1]];
    }));
  }
  function step(state, action, answers = {}) {
    const s = clone(state);
    if (s.terminal) throw Error('Episode already ended');
    if (!['pick', 'move', 'drop'].includes(action)) throw Error('Unknown action');
    if (action === 'move' && ['lifted', 'drawing'].includes(s.phase)) {
      if (Object.entries(answers).some(([a, r]) => !activeAxes(s).includes(a) || !relations[a].includes(r))) {
        throw Error('Malformed move response');
      }
    }
    s.steps++;
    if (s.phase === 'idle' && action === 'pick') s.phase = 'lifted';
    else if (s.phase === 'lifted' && action === 'drop') {
      s.phase = 'drawing'; s.anchor = [...s.pen]; s.stroke = [[...s.pen]];
      s.intervals = initial(s.case).intervals;
    } else if (s.phase === 'drawing' && action === 'pick') {
      s.phase = 'finished'; s.terminal = 'submitted';
    } else if (action === 'move' && ['lifted', 'drawing'].includes(s.phase)) {
      const next = [...s.pen];
      for (const [i, a] of axes.entries()) {
        if (!(a in answers)) continue;
        const result = interval(s.pen[i], s.intervals[a], answers[a], a);
        s.intervals[a] = result.bounds;
        if (result.exhausted) {s.terminal = 'search_exhausted'; break;}
        next[i] = result.position;
      }
      if (!s.terminal) {
        s.pen = next;
        if (s.phase === 'drawing') {
          if (s.inkMode === 'line_tool') s.stroke = [[...s.anchor], [...s.pen]];
          else if (s.stroke.at(-1).some((v, i) => v !== s.pen[i])) s.stroke.push([...s.pen]);
        }
      }
    } else s.invalid_actions++;
    if (!s.terminal && s.steps >= s.maxSteps) s.terminal = 'step_limit';
    return s;
  }
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function segmentDistance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0])*dx + (p[1] - a[1])*dy)/(dx*dx + dy*dy)));
    return Math.hypot(p[0] - a[0] - t*dx, p[1] - a[1] - t*dy);
  }
  function metrics(s) {
    const startError = s.anchor ? distance(s.anchor, s.case.start) : null;
    const endError = distance(s.pen, s.case.end);
    const deviation = s.stroke.length ? Math.max(...s.stroke.map(p => segmentDistance(p, s.case.start, s.case.end))) : null;
    const length = s.stroke.slice(1).reduce((sum, p, i) => sum + distance(p, s.stroke[i]), 0);
    return {success: s.terminal === 'submitted' && startError === 0 && endError === 0 && deviation !== null && deviation <= .25,
      start_error: startError, end_error: endError, max_deviation: deviation, path_length: length,
      length_ratio: length / distance(s.case.start, s.case.end), steps: s.steps,
      invalid_actions: s.invalid_actions, terminal: s.terminal};
  }
  const api = {clone, interval, initial, target, activeAxes, snapshot, oracleAction, oracleRelations, step, metrics};
  root.BrushMechanics = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
