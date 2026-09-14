const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../forecaster.html'),'utf8');
const code = html.slice(html.indexOf('const groupCalendarConflicts ='),html.indexOf('const CalendarConflictSummary ='));
const group = new Function(code+';return groupCalendarConflicts;')();

test('groups shared dates, preserves every affected ID, and removes only represented duplicate alerts',()=>{
    const review={records:[
        {ds:'2026-02-14',unique_id:'B',conflict:true},
        {ds:'2026-02-14',unique_id:'A',conflict:true},
        {ds:'2026-01-12',unique_id:'A',conflict:true},
        {ds:'2026-02-14',unique_id:'B',conflict:true},
        {ds:'2026-01-13',unique_id:'C',closed:true,conflict:false},
    ],items:[{id:'A',conflicts:2,error:'Sales on closures'},{id:'B',conflicts:1,error:'Sales on closures'}],
    calendar_errors:['A: Sales on closures','B: Sales on closures','C: No open observations']};
    assert.deepEqual(group(review),{dates:[
        {date:'2026-01-12',items:[{id:'A',original:undefined}],ids:['A']},
        {date:'2026-02-14',items:[{id:'A',original:undefined},{id:'B',original:undefined}],ids:['A','B']},
    ],itemCount:2,otherErrors:['C: No open observations']});
});
test('does not hide errors when detailed conflict records are unavailable',()=>{
    assert.deepEqual(group(null),{dates:[],itemCount:0,otherErrors:[]});
    const review={items:[{id:'A',conflicts:1,error:'Conflict'}],calendar_errors:['A: Conflict']};
    assert.deepEqual(group(review).otherErrors,['A: Conflict']);
});

const findHelpers = new Function(html.slice(html.indexOf('const findCalendarExceptionConflicts ='),html.indexOf('const OperatingCalendarEditor ='))+';return {findCalendarExceptionConflicts, overlappingExceptionMessage};')();
const findConflicts = findHelpers.findCalendarExceptionConflicts;
const overlapMessage = findHelpers.overlappingExceptionMessage;
const exception=(status,start='2026-02-14',end=start,ids=[])=>({status,start,end,ids});
test('opposite statuses on the same date are reported with their exception indices',()=>{
    assert.deepEqual(findConflicts([exception('open'),exception('closed')]),[{indices:[0,1],start:'2026-02-14',end:'2026-02-14',ids:[]}]);
});
test('date ranges identify the actual overlap regardless of status or item IDs',()=>{
    assert.deepEqual(findConflicts([exception('open','2026-02-10','2026-02-20',['A','B']),exception('closed','2026-02-14','2026-02-25',['C'])]),[{indices:[0,1],start:'2026-02-14',end:'2026-02-20',ids:[]}]);
});
test('distinct days are allowed, but the same day cannot appear twice',()=>{
    assert.deepEqual(findConflicts([exception('open'),exception('closed','2026-02-15')]),[]);
    assert.equal(findConflicts([exception('open',undefined,undefined,['A']),exception('closed',undefined,undefined,['B'])]).length,1);
    assert.equal(findConflicts([exception('open'),exception('closed',undefined,undefined,['A'])]).length,1);
    assert.match(overlapMessage(exception('closed'),[exception('open')]),/already in the exception list/);
    assert.equal(overlapMessage(exception('closed','2026-02-15'),[exception('open')]),'');
});

test('repeated Open and Closed rules also conflict, including partially overlapping ranges',()=>{
    for (const status of ['open','closed']) {
        assert.equal(findConflicts([exception(status),exception(status)]).length,1);
        assert.equal(findConflicts([exception(status,'2026-02-10','2026-02-15',['A']),exception(status,'2026-02-14','2026-02-20',['A'])]).length,1);
    }
});

const weekly = new Function(
    html.slice(html.indexOf('const calendarConflictShiftDate ='),html.indexOf('const CalendarConflictSummary ='))
    + html.slice(html.indexOf('const oppositeExceptionCoversDate ='),html.indexOf('const OperatingCalendarEditor ='))
    + ';return {firstWeeklyRedundantDate, weeklyRedundantExceptionMessage, weeklyExceptionConflicts};'
)();
const weekdays=[0,1,2,3,4];
test('closed Saturdays and open Mondays are rejected as weekly-schedule duplicates',()=>{
    const closedSaturday={status:'closed',start:'2026-01-03',end:'2026-01-03',ids:[]};
    const openMonday={status:'open',start:'2026-01-05',end:'2026-01-05',ids:[]};
    assert.equal(weekly.firstWeeklyRedundantDate(closedSaturday,weekdays,[]),'2026-01-03');
    assert.equal(weekly.firstWeeklyRedundantDate(openMonday,weekdays,[]),'2026-01-05');
    assert.match(weekly.weeklyRedundantExceptionMessage(closedSaturday,weekdays,[]),/already closed/);
    assert.match(weekly.weeklyRedundantExceptionMessage(openMonday,weekdays,[]),/already open/);
    assert.deepEqual(weekly.weeklyExceptionConflicts([{...closedSaturday,label:'Extra Saturday'}],weekdays),[{
        indices:[0], start:'2026-01-03', end:'2026-01-03', ids:[],
        message:'Closed exceptions are only for days that are usually open. This date is already closed by the weekly schedule.',
    }]);
    assert.deepEqual(weekly.weeklyExceptionConflicts([{...openMonday,label:'New Year\'s Day'}],weekdays),[]);
    assert.equal(weekly.firstWeeklyRedundantDate({status:'Closed',start:'2026-01-03',end:'2026-01-03',ids:[]},['0','1','2','3','4'],[]),'2026-01-03');
});
test('open Saturdays, closed Mondays and item reopenings of weekday closures are allowed',()=>{
    assert.equal(weekly.firstWeeklyRedundantDate({status:'open',start:'2026-01-03',end:'2026-01-03',ids:[]},weekdays,[]),null);
    assert.equal(weekly.firstWeeklyRedundantDate({status:'closed',start:'2026-01-05',end:'2026-01-05',ids:[]},weekdays,[]),null);
    const closedMonday={status:'closed',start:'2026-01-05',end:'2026-01-05',ids:[]};
    const openMondayA={status:'open',start:'2026-01-05',end:'2026-01-05',ids:['A']};
    assert.equal(weekly.firstWeeklyRedundantDate(openMondayA,weekdays,[closedMonday]),null);
    assert.deepEqual(weekly.weeklyExceptionConflicts([{...openMondayA,label:'Recorded sales kept'}, closedMonday],weekdays),[]);
});
