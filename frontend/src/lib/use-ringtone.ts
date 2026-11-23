'use client';
import {useEffect,useRef} from 'react';
// A user gesture unlocks sound. Browsers may still silence background tabs;
// the incoming-call panel and push remain available in that case.
export function useRingtone(ringing:boolean){
 const context=useRef<AudioContext|null>(null),nodes=useRef<OscillatorNode[]>([]);
 useEffect(()=>{const unlock=()=>{try{context.current??=new AudioContext();void context.current.resume().catch(()=>{});}catch{/* visual ringing still works */}};window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);void context.current?.close().catch(()=>{});context.current=null;};},[]);
 useEffect(()=>{if(!ringing)return;const pulse=()=>{const c=context.current;if(!c||c.state!=='running')return;for(const frequency of [440,480]){const oscillator=c.createOscillator(),gain=c.createGain();oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(.06,c.currentTime+.03);gain.gain.setValueAtTime(.06,c.currentTime+.65);gain.gain.linearRampToValueAtTime(0,c.currentTime+.7);oscillator.connect(gain).connect(c.destination);oscillator.start();oscillator.stop(c.currentTime+.72);nodes.current.push(oscillator);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();nodes.current=nodes.current.filter(n=>n!==oscillator);};}};pulse();const timer=setInterval(pulse,2400);return()=>{clearInterval(timer);for(const n of nodes.current){try{n.stop();}catch{}}nodes.current=[];};},[ringing]);
}
