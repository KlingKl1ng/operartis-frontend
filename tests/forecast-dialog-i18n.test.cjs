const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../forecast-dialog-i18n.js'),'utf8'),context);
const {translate:tr,messages} = context.window.ForecastDialogI18n;
const html = fs.readFileSync(path.join(__dirname,'../forecaster.html'),'utf8');

test('all explicitly translated dialog phrases have Vietnamese and German entries',()=>{
 for(const match of html.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)){
  const key=JSON.parse('"'+match[1]+'"');
  assert.ok(messages[key]?.vi,key+' missing Vietnamese');
  assert.ok(messages[key]?.de,key+' missing German');
 }
 for(const [key,values] of Object.entries(messages)){
  for(const lang of ['vi','de']){
   assert.ok(values[lang].trim());
   assert.deepEqual((values[lang].match(/\{\d+\}/g)||[]).sort(),(key.match(/\{\d+\}/g)||[]).sort(),key+' placeholders');
  }
 }
});

test('dynamic status summaries translate every segment and retain counts',()=>{
 const summary='0/271 gaps handled · 271 unresolved · 10 items need review';
 assert.equal(tr(summary,'vi-VN'),'Đã xử lý 0/271 giá trị thiếu · 271 chưa xử lý · 10 mã hàng cần kiểm tra');
 assert.equal(tr(summary,'de-DE'),'0/271 Lücken bearbeitet · 271 ungelöst · 10 Artikel müssen geprüft werden');
 assert.equal(tr('All 21 gaps handled · Review confirmed','vi-VN'),'Đã xử lý tất cả 21 giá trị thiếu · Đã xác nhận kiểm tra');
 assert.equal(tr('10/10 items need attention','de-DE'),'10/10 Artikel erfordern Aufmerksamkeit');
 assert.equal(tr('Exceptions (2)','vi-VN'),'Ngoại lệ (2)');
 assert.equal(tr(summary,'en-US'),summary);
});

test('error details and named actions preserve identifiers, dates and unknown text',()=>{
 const error='Operating calendar: Every exception must fall within the operating calendar coverage.';
 assert.equal(tr(error,'de-DE'),'Betriebskalender: Jede Ausnahme muss innerhalb der Kalendergültigkeit liegen.');
 const conflict='CAL-001: Sales were recorded on closed dates. Correct the operating calendar or source data: 14/02/2026';
 assert.equal(tr(conflict,'vi-VN'),'CAL-001: Có doanh số vào ngày đóng cửa. Sửa lịch hoạt động hoặc dữ liệu nguồn: 14/02/2026');
 assert.equal(tr('Actions for Observed','vi-VN'),'Thao tác với Observed');
 assert.equal(tr('CAL-001','vi-VN'),'CAL-001');
 assert.equal(tr('An unknown server message','de-DE'),'An unknown server message');
 assert.equal(tr(144,'vi-VN'),144);
});

test('translated preview states are searchable without changing canonical row data',()=>{
 const constants=html.match(/const PREPARATION_METHODS = .*?;/)[0];
 const helpers=html.slice(html.indexOf('const filterPreparationRecords ='),html.indexOf('const MissingDataReview ='));
 const {preparationPreviewCells:cells,indexPreviewRows:index,searchPreviewRows:search,previewSearchTerms:terms}=new Function(constants+helpers+';return {preparationPreviewCells,indexPreviewRows,searchPreviewRows,previewSearchTerms}')();
 const row={unique_id:'CAL-001',ds:'2026-02-14',original:null,prepared:null,missing:true,kind:'absent_period'};
 const before=JSON.stringify(row);
 for(const [locale,query] of [['vi-VN','chua xu ly'],['de-DE','ungelost'],['en-US','unresolved']]){
  const indexed=index([row],r=>[...cells(r),...cells(r).slice(2).map(v=>tr(v,locale))]);
  assert.equal(search(indexed,terms(query))[0],row);
  assert.equal(search(indexed,terms('CAL-001 2026-02-14'))[0],row);
 }
 const observed={...row,original:144,prepared:144,missing:false};
 assert.equal(search(index([observed],r=>cells(r).slice(2).map(v=>tr(v,'vi-VN'))),terms('da ghi nhan'))[0],observed);
 assert.equal(JSON.stringify(row),before);
});


test('intermittent-history counts and warnings translate into Vietnamese and German',()=>{
 for(const locale of ['vi-VN','de-DE']) {
  for(const text of ['No method suggested','History pattern:','Why:','Warning:',
   '21 of 32 recorded values are zero.',
   'Intermittent activity: recorded zero sales alternate with occasional nonzero sales.',
   'The surrounding values do not tell us whether a missing period had zero sales or unrecorded sales, so no filling method is recommended.',
   'Interpolation or carrying values forward can invent sales; filling with zero can hide unrecorded sales.']) {
   assert.notEqual(tr(text,locale),text);
  }
  const counts=tr('21 of 32 recorded values are zero.',locale);
  assert.ok(counts.includes('21') && counts.includes('32'));
 }
});
