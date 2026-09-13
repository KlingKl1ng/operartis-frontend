const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../forecaster.html'),'utf8');
const constants=source.match(/const PREPARATION_METHODS = .*?;/)[0];
const helpers=source.slice(source.indexOf('const filterPreparationRecords ='),source.indexOf('const MissingDataReview ='));
const {preparationPreviewCells:cells,previewSearchTerms:terms,indexPreviewRows:index,searchPreviewRows:search,filterPreparationRecords:filter}=new Function(constants+helpers+';return {preparationPreviewCells,previewSearchTerms,indexPreviewRows,searchPreviewRows,filterPreparationRecords};')();
const conflictGroupingSource=source.slice(source.indexOf('const groupCalendarConflicts ='),source.indexOf('const calendarConflictShiftDate ='));
const {groupCalendarConflicts:groupConflicts}=new Function(conflictGroupingSource+';return {groupCalendarConflicts};')();
const conflictResolutionSource=source.slice(source.indexOf('const calendarConflictShiftDate ='),source.indexOf('const CalendarConflictSummary ='));
const {calendarConflictResolutionPatch:resolveConflicts,pruneCalendarSalesResolutions:pruneResolutions}=new Function(conflictResolutionSource+';return {calendarConflictResolutionPatch,pruneCalendarSalesResolutions};')();
const verticalSource=source.slice(source.indexOf('const verticalForecastPreviewRows ='),source.indexOf('const PREPARATION_METHODS ='));
const {verticalForecastPreviewRows:verticalize}=new Function(verticalSource+';return {verticalForecastPreviewRows};')();
const find=(rows,q)=>search(index(rows,cells),terms(q));
test('search spans all rows, columns and displayed status labels without changing source',()=>{
 const rows=Array.from({length:50},(_,i)=>({unique_id:`CAL-${i}`,ds:'2026-02-14',original:i,prepared:i}));
 rows.push({unique_id:'Café',ds:'2026-02-15',original:null,original_kind:'absent_period',prepared:0,closed:true});
 const before=JSON.stringify(rows);
 assert.deepEqual(find(rows,'cal-49'),[rows[49]]);
 assert.deepEqual(find(rows,'CAFE "missing period" "no record" 0'),[rows[50]]);
 assert.deepEqual(find(rows,'cal-49 2026-02-14 49 observed'),[rows[49]]);
 assert.equal(JSON.stringify(rows),before);
});
test('literal words, quoted phrases, blanks and punctuation are safe and predictable',()=>{
 const rows=[['Alpha [x]','Two words'],['ALPHA','Two unrelated words']];
 const indexed=index(rows,row=>row);
 assert.deepEqual(search(indexed,terms('alpha "two words"')),[rows[0]]);
 assert.deepEqual(search(indexed,terms('[x]')),[rows[0]]);
 assert.deepEqual(search(indexed,terms('   ""  ')),rows);
 assert.deepEqual(search(indexed,terms('.*')),[]);
 assert.deepEqual(search(indexed,terms('ALPHA words')),rows);
});
test('distinguishes observed, missing, conflict and resolved calendar states',()=>{
 const rows=[{original:null,prepared:null,missing:true,kind:'empty_quantity'}, {original:144,prepared:null,conflict:true}, {original:144,prepared:0,closed:true,calendar_conflict_resolved:true,calendar_conflict_resolution:'closed'}, {original:144,prepared:144,calendar_conflict_resolved:true,calendar_conflict_resolution:'open'}];
 assert.deepEqual(find(rows,'empty unresolved'),[rows[0]]);
 assert.deepEqual(find(rows,'"calendar conflict · no change"'),[rows[1]]);
 assert.deepEqual(find(rows,'"closed · conflict resolved"'),[rows[2]]);
 assert.deepEqual(find(rows,'"open · conflict resolved"'),[rows[3]]);
 assert.deepEqual(cells(rows[2])[4],'Closed · conflict resolved');
 assert.deepEqual(cells(rows[3])[4],'Open · conflict resolved');
});
test('groups conflict values and keeps recorded sales by opening the exception',()=>{
 const review={records:[
  {ds:'2023-01-20',unique_id:'B',original:16,conflict:true},
  {ds:'2023-01-20',unique_id:'A',original:27,conflict:true},
  {ds:'2023-01-21',unique_id:'A',original:5,conflict:false},
 ],items:[],calendar_errors:[]};
 const grouped=groupConflicts(review);
 assert.deepEqual(grouped.dates,[{date:'2023-01-20',items:[{id:'A',original:27},{id:'B',original:16}],ids:['A','B']}]);
 const calendar={enabled:true,weekdays:[0,1,2,3,4],exceptions:[{start:'2023-01-20',end:'2023-01-20',status:'closed',ids:[],label:'Lunar New Year'}]};
 const current={A:{'2023-01-19':'open','2023-01-20':'closed'}};
 const keep=resolveConflicts(calendar,current,grouped.dates[0],'open');
 assert.deepEqual(keep.operating_calendar.exceptions,[]);
 assert.deepEqual(keep.calendar_sales_resolutions,{});
 assert.deepEqual(current,{A:{'2023-01-19':'open','2023-01-20':'closed'}});
 const confirm=resolveConflicts(calendar,{A:{'2023-01-19':'open'}},grouped.dates[0],'closed');
 assert.deepEqual(confirm.operating_calendar.exceptions,calendar.exceptions);
 assert.deepEqual(confirm.calendar_sales_resolutions,{A:{'2023-01-20':'closed'},B:{'2023-01-20':'closed'}});
});
test('confirm closed on a weekly closed day does not add an exception',()=>{
 const group={date:'2026-01-03',ids:['DATE-001']};
 const confirm=resolveConflicts({enabled:true,weekdays:[0,1,2,3,4],exceptions:[]},{},group,'closed');
 assert.deepEqual(confirm.operating_calendar.exceptions,[]);
 assert.deepEqual(confirm.calendar_sales_resolutions,{'DATE-001':{'2026-01-03':'closed'}});
 const reopened=pruneResolutions(confirm.calendar_sales_resolutions,[{start:'2026-01-03',end:'2026-01-03',status:'open',ids:[],label:'Extra Saturday opening'}]);
 assert.deepEqual(reopened,{});
 assert.deepEqual(pruneResolutions(confirm.calendar_sales_resolutions,[]),confirm.calendar_sales_resolutions);
});
test('keep recorded sales splits a closed range and adds an open exception only on usual closed days',()=>{
 const friday={date:'2023-01-20',ids:['A']};
 const split=resolveConflicts({weekdays:[0,1,2,3,4],exceptions:[{start:'2023-01-19',end:'2023-01-21',status:'closed',ids:[],label:'Break'}]},{},friday,'open');
 assert.deepEqual(split.operating_calendar.exceptions,[
  {start:'2023-01-19',end:'2023-01-19',status:'closed',ids:[],label:'Break'},
  {start:'2023-01-21',end:'2023-01-21',status:'closed',ids:[],label:'Break'},
 ]);
 const saturday={date:'2026-01-03',ids:['A']};
 const added=resolveConflicts({weekdays:[0,1,2,3,4],exceptions:[]},{},saturday,'open');
 assert.deepEqual(added.operating_calendar.exceptions,[{start:'2026-01-03',end:'2026-01-03',status:'open',ids:['A'],label:'Recorded sales kept'}]);
});
test('search composes with ID, unresolved and open-day filters',()=>{
 const a={unique_id:'A',ds:'2026-02-14',original:4,prepared:null,closed:true,conflict:true};
 const b={unique_id:'B',ds:'2026-02-14',original:4,prepared:4};
 const review={records:find([a,b],'2026-02'),items:[],policy:{}};
 assert.deepEqual(filter(review,'A',true,true),[a]);
 assert.deepEqual(filter(review,'B',true,false),[]);
});
test('template item selection uses the mapped column and combines with search for both layouts',()=>{
 const verticalSource={format:'vertical',headers:['Date','ID','Qty'],mapping:{sku:'ID',date:'Date',value:'Qty'},rows:[['2026-01-01','A',10],['2026-01-02','A',12],['2026-01-01','B',10]]};
 const vertical=verticalize(verticalSource);
 assert.deepEqual([...new Set(vertical.map(row=>row.unique_id))],['A','B']);
 assert.deepEqual(filter({records:search(index(vertical,row=>Object.values(row)),terms('2026-01-02'))},'A',false,false),[vertical[1]]);
 assert.deepEqual(filter({records:vertical},'B',false,false),[vertical[2]]);
 const horizontalSource={format:'horizontal',headers:['ID','Jan','Feb'],mapping:{sku:'ID',start:'Jan',end:'Feb'},rows:[[100,2,3],[200,4,5]]};
 const horizontal=verticalize(horizontalSource);
 assert.deepEqual([...new Set(horizontal.map(row=>row.unique_id))],['100','200']);
 assert.deepEqual(filter({records:search(index(horizontal,row=>Object.values(row)),terms('5'))},'200',false,false),[horizontal[3]]);
 assert.deepEqual(filter({records:horizontal},'',false,false),horizontal);
 assert.deepEqual(verticalize({...verticalSource,mapping:{...verticalSource.mapping,sku:'Missing'}}),[]);
});
