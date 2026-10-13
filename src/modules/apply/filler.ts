import { normalizeQuestionLabel } from "./questions";
import type { PreparedAnswer } from "./types";

export type FillableField = {
  name: string;
  id: string;
  tag: "input" | "textarea" | "select";
  type: string;
  label: string;
  options: Array<{ value: string; text: string }>;
};

export type FillAnswer = {
  label: string;
  answer: string;
  atsField?: string;
};

export type PlannedFill = {
  fieldName: string;
  fieldId: string;
  value: string;
};

const SKIP_TYPES = new Set([
  "hidden",
  "file",
  "submit",
  "button",
  "reset",
  "image",
  "checkbox",
  "radio",
  "password",
]);

function tailMatch(fieldName: string, atsField: string): boolean {
  const field = normalizeQuestionLabel(fieldName);
  const key = normalizeQuestionLabel(atsField);
  if (!field || !key) return false;
  if (field === key) return true;
  const fieldTokens = field.split(" ");
  const keyTokens = key.split(" ");
  return fieldTokens.slice(-keyTokens.length).join(" ") === key;
}

function scoreField(field: FillableField, answer: FillAnswer): number {
  const fieldLabel = normalizeQuestionLabel(field.label);
  const answerLabel = normalizeQuestionLabel(answer.label);
  let score = 0;
  if (fieldLabel && answerLabel && fieldLabel === answerLabel) score = 100;
  else if (
    fieldLabel &&
    answerLabel &&
    fieldLabel.length >= 4 &&
    answerLabel.length >= 4 &&
    (fieldLabel.includes(answerLabel) || answerLabel.includes(fieldLabel))
  ) {
    score = 60;
  }
  if (answer.atsField && tailMatch(field.name || field.id, answer.atsField)) score += 50;
  if (answerLabel === "name" && /(first|last|legal|preferred|user|company)/.test(fieldLabel)) score -= 80;
  return score;
}

function optionValue(field: FillableField, answer: string): string | null {
  const wanted = normalizeQuestionLabel(answer);
  const match = field.options.find((option) => {
    const text = normalizeQuestionLabel(option.text);
    return text === wanted || (text.length >= 3 && wanted.length >= 3 && (text.includes(wanted) || wanted.includes(text)));
  });
  return match?.value ?? null;
}

export function planFieldFills(fields: FillableField[], answers: FillAnswer[]): PlannedFill[] {
  const remaining = fields.filter((field) => !SKIP_TYPES.has(field.type.toLowerCase()));
  const plans: PlannedFill[] = [];
  for (const answer of answers) {
    if (!answer.answer.trim()) continue;
    let best: FillableField | null = null;
    let bestScore = 69;
    for (const field of remaining) {
      if (plans.some((plan) => plan.fieldId === field.id && plan.fieldName === field.name)) continue;
      const score = scoreField(field, answer);
      if (score > bestScore) {
        best = field;
        bestScore = score;
      }
    }
    if (!best) continue;
    let value = answer.answer.trim().slice(0, 8000);
    if (best.type.toLowerCase() === "number") value = value.replace(/[^0-9.]/g, "");
    if (best.tag === "select") {
      const selected = optionValue(best, value);
      if (!selected) continue;
      value = selected;
    }
    if (!value) continue;
    plans.push({ fieldName: best.name, fieldId: best.id, value });
  }
  return plans;
}

export function fillerPayload(input: {
  provider: string;
  applyUrl: string | null;
  answers: PreparedAnswer[];
}): string {
  return JSON.stringify(
    {
      provider: input.provider,
      applyUrl: input.applyUrl,
      answers: input.answers
        .filter((answer) => answer.answer.trim() && answer.kind !== "file")
        .map((answer) => ({
          label: answer.label,
          answer: answer.answer,
          ...(answer.atsField ? { atsField: answer.atsField } : {}),
        })),
    },
    null,
    2
  );
}

const BOOKMARKLET_SCRIPT = `(function(){
var raw=prompt("Paste the assisted-apply payload. This fills fields only. You still review and submit.");
if(!raw)return;
var data;try{data=JSON.parse(raw);}catch(e){alert("That was not valid JSON.");return;}
var answers=(data&&data.answers)||[];
if(!answers.length){alert("No answers in that payload.");return;}
function norm(s){return String(s||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();}
function labelFor(el){
var bits=[];
var aria=el.getAttribute("aria-label");
if(aria)bits.push(aria);
if(el.getAttribute("placeholder"))bits.push(el.getAttribute("placeholder"));
if(el.id){
var esc=window.CSS&&CSS.escape?CSS.escape(el.id):el.id;
var lab=document.querySelector('label[for="'+esc+'"]');
if(lab)bits.push(lab.textContent||"");
}
var wrap=el.closest?el.closest("label"):null;
if(wrap)bits.push(wrap.textContent||"");
var parent=el.parentElement;
if(parent){var prev=parent.querySelector("label, legend");if(prev)bits.push(prev.textContent||"");}
return norm(bits.join(" "));
}
function tailMatch(fieldName,ats){
var field=norm(fieldName),key=norm(ats);
if(!field||!key)return false;
if(field===key)return true;
var ft=field.split(" "),at=key.split(" ");
return ft.slice(-at.length).join(" ")===key;
}
function score(el,answer){
var fieldLabel=labelFor(el),answerLabel=norm(answer.label),s=0;
if(fieldLabel&&answerLabel&&fieldLabel===answerLabel)s=100;
else if(fieldLabel&&answerLabel&&fieldLabel.length>=4&&answerLabel.length>=4&&(fieldLabel.indexOf(answerLabel)!==-1||answerLabel.indexOf(fieldLabel)!==-1))s=60;
if(answer.atsField&&tailMatch(el.name||el.id||"",answer.atsField))s+=50;
if(answerLabel==="name"&&/(first|last|legal|preferred|user|company)/.test(fieldLabel))s-=80;
return s;
}
function setValue(el,value){
if(el.tagName==="SELECT"){
var wanted=norm(value);
var option=Array.prototype.find.call(el.options,function(opt){
var text=norm(opt.text);
return text===wanted||(text&&wanted&&text.length>=3&&wanted.length>=3&&(text.indexOf(wanted)!==-1||wanted.indexOf(text)!==-1));
});
if(!option)return false;
value=option.value;
}
var proto=el.tagName==="TEXTAREA"?window.HTMLTextAreaElement.prototype:el.tagName==="SELECT"?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
var desc=Object.getOwnPropertyDescriptor(proto,"value");
if(desc&&desc.set)desc.set.call(el,value);else el.value=value;
el.dispatchEvent(new Event("input",{bubbles:true}));
el.dispatchEvent(new Event("change",{bubbles:true}));
return true;
}
var skip={hidden:1,file:1,submit:1,button:1,reset:1,image:1,checkbox:1,radio:1,password:1};
var fields=Array.prototype.filter.call(document.querySelectorAll("input, textarea, select"),function(el){
return !skip[(el.type||"").toLowerCase()];
});
var filled=0;
var list=answers.slice(0,80);
for(var i=0;i<list.length;i++){
var answer=list[i];
if(!answer||!answer.answer)continue;
var best=null,bestScore=69;
for(var j=0;j<fields.length;j++){
var s=score(fields[j],answer);
if(s>bestScore){bestScore=s;best=fields[j];}
}
if(!best)continue;
var value=String(answer.answer).slice(0,8000);
if((best.type||"").toLowerCase()==="number")value=value.replace(/[^0-9.]/g,"");
if(setValue(best,value)){filled++;fields.splice(fields.indexOf(best),1);}
}
alert("Filled "+filled+" field(s). Review the form, attach files yourself, then submit. This script does not submit.");
})();`;

export function bookmarkletSource(): string {
  return BOOKMARKLET_SCRIPT;
}

export function bookmarkletHref(): string {
  return `javascript:${BOOKMARKLET_SCRIPT}`;
}
