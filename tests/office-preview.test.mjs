import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import { readDocument, pageIndex, zoomFactor, rowWindow, fitDocument } from '../sdk/web/document.js';
import { sheetRange, readRows, parseWorkbook } from '../plugins/excel/ui/sheet-model.js';
import { references } from '../scripts/build-plugins.mjs';
const sandbox={}; vm.runInNewContext(await fs.readFile(new URL('../plugins/excel/ui/vendor/xlsx.full.min.js',import.meta.url),'utf8'),sandbox); const XLSX=sandbox.XLSX;
test('document transport is bounded, chunked and rejects changed files',async()=>{
 const size=1024*1024+17,calls=[];
 const result=await readDocument(async(offset,length)=>{calls.push([offset,length]);return new Uint8Array(length).fill(offset?2:1);},size);
 assert.deepEqual(calls,[[0,1024*1024],[1024*1024,17]]);assert.equal(new Uint8Array(result).at(-1),2);
 await assert.rejects(readDocument(()=>assert.fail(),64*1024*1024+1),/budget/);
 await assert.rejects(readDocument(async()=>new Uint8Array(1),2),/truncated/);
});
test('navigation and virtual rows stay bounded even beyond the end',()=>{
 assert.equal(pageIndex(-2,3),0);assert.equal(pageIndex(99,3),2);assert.equal(zoomFactor(900),4);
 assert.deepEqual(rowWindow(0,28,5000,560),{first:0,last:28,top:0,bottom:4972*28});
 const end=rowWindow(99999,28,2,560);assert.equal(end.first,2);assert.equal(end.last,2);assert.equal(end.top,56);
 const huge=rowWindow(0,28,100000,100000);assert.equal(huge.last-huge.first,200);
});
test('worksheet extraction supports dense and sparse values, cached formulas and text',()=>{
 const source=[['<img src=x onerror=alert(1)>',123],['label',456]];
 for(const dense of [true,false]){
 const sheet=XLSX.utils.aoa_to_sheet(source,{dense});const cell=dense?sheet['!data'][0][1]:sheet.B1;cell.f='100+23';cell.w='123.00';
 const book={SheetNames:['Example'],Sheets:{Example:sheet}};const rows=readRows(book,0,0,2,XLSX);
 assert.equal(rows[0][0].text,source[0][0]);assert.deepEqual(rows[0][1],{text:'123.00',formula:'100+23',numeric:true});
 assert.throws(()=>readRows(book,0,0,201,XLSX),/request/);assert.throws(()=>readRows(book,1,0,1,XLSX),/request/);
 }
});
test('worksheet limits respect absolute parsed row offsets and used columns',()=>{
 assert.deepEqual(sheetRange({'!fullref':'C5:XFD200000'},XLSX),{rows:99996,columns:256,startRow:4,startColumn:2,truncated:true});
 assert.equal(sheetRange({'!fullref':'A150000:A150001'},XLSX).rows,0);
 assert.equal(sheetRange({},XLSX).rows,0);
});
test('package import checks distinguish actual imports from strings and comments',async()=>{
 assert.deepEqual(await references(`const s='from "foo"'; /* import "nope" */ export const v=1;`,'.js'),[]);
 assert.deepEqual(await references('import {x} from "./module.js"; await import("./lazy.js"); console.log(x);','.js'),['./module.js','./lazy.js']);
});

test('slide fit preserves the whole image in a wide short window',()=>{assert.equal(fitDocument(1418,398,960,720),398/720);assert.equal(fitDocument(400,1000,960,720),400/960);});
test('uncached formulas remain visible even with an empty formatted value',()=>{const book={SheetNames:['A'],Sheets:{A:{'!ref':'A1',A1:{t:'n',f:'1+2',w:''}}}};assert.equal(readRows(book,0,0,1,XLSX)[0][0].text,'=1+2');});

test('actual XLSX parsing retains formulas without saved results',()=>{const original={SheetNames:['A'],Sheets:{A:{'!ref':'A1',A1:{t:'n',f:'1+2'}}}};const bytes=XLSX.write(original,{type:'array',bookType:'xlsx'});const book=parseWorkbook(bytes,XLSX);assert.equal(readRows(book,0,0,1,XLSX)[0][0].text,'=1+2');});
