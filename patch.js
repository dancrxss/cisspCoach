const fs=require('fs');const F='/Users/admin/Apps/cisspCoach/content/gen/d6.json';
const d=JSON.parse(fs.readFileSync(F,'utf8'));
// o: new options in same order; w: new why by option idx; l: {stepIdx:text}; cat: categories
const P={
0:{o:[null,null,null,null],l:{1:"Whose opinion would an outsider trust, given who employs and pays the examiner?"},cat:['lad']},
1:{o:["It identifies and ranks weaknesses without exploiting them",null,null,null},cat:['len']},
};
