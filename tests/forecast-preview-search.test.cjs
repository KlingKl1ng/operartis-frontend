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
const {calendarConflictResolutionPatch:resolveConflicts,pruneCalendarSalesResolutions:pruneResolutions,calendarDisablePatch:disableCalendar,mergeProposedHolidayClosures:mergeHolidays,visibleCalendarExceptions:visibleExceptions,retainPendingHolidayProposals:retainProposals,proposableHolidayClosures:proposableHolidays,calendarConflictDateLabel:conflictDateLabel}=new Function(conflictResolutionSource+';return {calendarConflictResolutionPatch,pruneCalendarSalesResolutions,calendarDisablePatch,mergeProposedHolidayClosures,visibleCalendarExceptions,retainPendingHolidayProposals,proposableHolidayClosures,calendarConflictDateLabel};')();
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
 assert.deepEqual(keep.operating_calendar.exceptions,[
  {start:'2023-01-20',end:'2023-01-20',status:'open',ids:[],label:'Lunar New Year'},
 ]);
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
test('keep recorded sales splits a closed range and adds an open exception for recorded sales',()=>{
 const friday={date:'2023-01-20',ids:['A']};
 const split=resolveConflicts({weekdays:[0,1,2,3,4],exceptions:[{start:'2023-01-19',end:'2023-01-21',status:'closed',ids:[],label:'Break'}]},{},friday,'open');
 assert.deepEqual(split.operating_calendar.exceptions,[
  {start:'2023-01-19',end:'2023-01-19',status:'closed',ids:[],label:'Break'},
  {start:'2023-01-21',end:'2023-01-21',status:'closed',ids:[],label:'Break'},
  {start:'2023-01-20',end:'2023-01-20',status:'open',ids:[],label:'Break'},
 ]);
 const saturday={date:'2026-01-03',ids:['A']};
 const added=resolveConflicts({weekdays:[0,1,2,3,4],exceptions:[]},{},saturday,'open');
 assert.deepEqual(added.operating_calendar.exceptions,[{start:'2026-01-03',end:'2026-01-03',status:'open',ids:['A'],label:'Recorded sales kept'}]);
 const newYear={date:'2023-01-01',ids:['GOINANI4060','GOINANI5070']};
 const holiday=resolveConflicts({weekdays:[0,1,2,3,4,5,6],exceptions:[{start:'2023-01-01',end:'2023-01-01',status:'closed',ids:[],label:"New Year's Day"}]},{},newYear,'open');
 assert.deepEqual(holiday.operating_calendar.exceptions,[
  {start:'2023-01-01',end:'2023-01-01',status:'open',ids:[],label:"New Year's Day"},
 ]);
});
test('proposed holidays stay out of exceptions until apply, then hide until the conflict is resolved',()=>{
 const proposals=[{date:'2023-01-01',label:"New Year's Day"}];
 const merged=mergeHolidays([],proposals);
 assert.deepEqual(merged,[{start:'2023-01-01',end:'2023-01-01',status:'closed',ids:[],label:"New Year's Day"}]);
 assert.deepEqual(visibleExceptions(merged,proposals),[]);
 assert.deepEqual(visibleExceptions(merged,[]),merged);
 const stillPending=retainProposals(proposals,merged,['2023-01-01']);
 assert.deepEqual(stillPending,proposals);
 assert.deepEqual(retainProposals(proposals,merged,[]),[]);
 assert.deepEqual(retainProposals(proposals,[],['2023-01-01']),proposals);
 const opened=[{start:'2023-01-01',end:'2023-01-01',status:'open',ids:[],label:"New Year's Day"}];
 assert.deepEqual(visibleExceptions(opened,proposals),opened);
});
test('propose all closures skips opened, weekly-closed and already proposed holidays',()=>{
 const holidays=[
  {date:'2023-01-01',label:"New Year's Day"},
  {date:'2023-01-02',label:"New Year's Day (observed)"},
  {date:'2023-01-20',label:'29 of Lunar New Year'},
  {date:'2023-01-21',label:"Lunar New Year's Eve"},
  {date:'2023-01-22',label:'Lunar New Year'},
 ];
 const weekdays=[0,1,2,3,4,5,6];
 assert.deepEqual(proposableHolidays(holidays,[{start:'2023-01-01',end:'2023-01-01',status:'open',ids:[],label:"New Year's Day"}],[{date:'2023-01-02',label:"New Year's Day (observed)"}],weekdays),[
  {date:'2023-01-20',label:'29 of Lunar New Year'},
  {date:'2023-01-21',label:"Lunar New Year's Eve"},
  {date:'2023-01-22',label:'Lunar New Year'},
 ]);
 assert.deepEqual(proposableHolidays(holidays,[],[], [0,1,2,3,4]).map(row=>row.date),['2023-01-02','2023-01-20']);
});
test('conflict dates show the holiday exception label when the closure was proposed',()=>{
 const exceptions=[{start:'2023-01-01',end:'2023-01-01',status:'closed',ids:[],label:"New Year's Day"},{start:'2023-01-20',end:'2023-01-20',status:'closed',ids:[],label:'29 of Lunar New Year'}];
 assert.equal(conflictDateLabel(exceptions,'2023-01-01'),"New Year's Day");
 assert.equal(conflictDateLabel(exceptions,'2023-01-20'),'29 of Lunar New Year');
 assert.equal(conflictDateLabel(exceptions,'2023-01-03'),'');
});
test('turning the calendar off restores the pre-enable policy and does not keep recorded sales',()=>{
 const applied={enabled:true,start:'2023-01-01',end:'2025-12-31',weekdays:[0,1,2,3,4],ids:[],exceptions:[{start:'2023-02-26',end:'2023-02-26',status:'closed',ids:[],label:'Holiday'}]};
 const restore={operating_calendar:{enabled:false,start:'',end:'',weekdays:[0,1,2,3,4],ids:[],exceptions:[]},calendar_sales_resolutions:{},calendar_conflicts_seen:{},frequency:null};
 const reverted=disableCalendar(applied,{'DATE-001':{'2023-02-26':'open'}},'daily',restore);
 assert.equal(reverted.operating_calendar.enabled,false);
 assert.deepEqual(reverted.operating_calendar.exceptions,[]);
 assert.deepEqual(reverted.calendar_sales_resolutions,{});
 assert.deepEqual(reverted.calendar_conflicts_seen,{});
 assert.equal(reverted.frequency,null);
 const deactivated=disableCalendar(applied,{'DATE-001':{'2023-02-26':'closed'}},'daily',null);
 assert.equal(deactivated.operating_calendar.enabled,false);
 assert.deepEqual(deactivated.operating_calendar.exceptions,applied.exceptions);
 assert.deepEqual(deactivated.calendar_sales_resolutions,{});
 assert.deepEqual(deactivated.calendar_conflicts_seen,{});
 assert.equal(deactivated.frequency,'daily');
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
