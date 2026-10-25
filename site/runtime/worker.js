// Serialized messages prevent overlapping initialization and stale Python state.
let runtime;
let queue = Promise.resolve();
async function run(message) {
  const {id, session, type, bench} = message;
  const progress = text => self.postMessage({id, session, progress:text});
  try {
    if (!runtime && type !== 'dispose') {
      progress('加载 Python 运行时…');
      const {loadPyodide} = await import('./pyodide.mjs');
      runtime = await loadPyodide({indexURL:new URL('./', import.meta.url).href});
      progress('加载正式环境…');
      const response = await fetch(new URL('./environments.zip', import.meta.url));
      if (!response.ok) throw Error('环境包加载失败');
      runtime.unpackArchive(await response.arrayBuffer(), 'zip');
    }
    if (!runtime) {self.postMessage({id,session,result:{disposed:true}});return;}
    if (type === 'init' || type === 'reset') {
      progress('加载计算与图像依赖…');
      await runtime.loadPackage(bench === 'drawing' ? ['numpy','scipy','pillow'] : ['pillow']);
    }
    runtime.globals.set('_request_json', JSON.stringify(message));
    const result = JSON.parse(await runtime.runPythonAsync('import json\nfrom vdec_runtime import dispatch\njson.dumps(dispatch(json.loads(_request_json)))'));
    self.postMessage({id,session,result});
  } catch(error) {self.postMessage({id,session,error:String(error)});}
}
self.onmessage = ({data}) => {queue = queue.then(() => run(data));};
