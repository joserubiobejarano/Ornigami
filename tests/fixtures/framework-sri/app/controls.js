'use client';
import { useState } from 'react';
export default function Controls() {
  const [result, setResult] = useState('idle');
  return <><button onClick={async () => {
    try { const loadedModule = await import('./late'); setResult(loadedModule.probe()); }
    catch { setResult('rejected'); }
  }}>Load late chunk</button><output id="late-result">{result}</output></>;
}
