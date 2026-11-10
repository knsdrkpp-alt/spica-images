import './ui/styles.css';
import norms from './diagnosis/norms.json';
import { App } from './app';
import { Recorder } from './audio/capture';

new App(document.getElementById('app')!, {
  openRecorder: () => Recorder.open(),
  norms,
}).start();
