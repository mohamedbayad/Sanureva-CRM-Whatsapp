import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay, dateValue, normalizePhone } from "@/lib/format";
import type { CrmSnapshot, SheetRecord } from "@/lib/types";

export const PIPELINE_STAGES = [
  { id: "new_lead", label: "New lead" },
  { id: "engaged", label: "In conversation" },
  { id: "awaiting_details", label: "Waiting for details" },
  { id: "order_placed", label: "Order placed" },
  { id: "confirmed", label: "Order confirmed" },
  { id: "tracking_sent", label: "Tracking sent" },
  { id: "in_delivery", label: "In delivery" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number]["id"];

export type SuggestedTemplate = {
  id: string;
  label: string;
  stage: PipelineStage | "read_no_reply";
  body: string;
  mode: "text" | "audio_suggestion";
  explanation: string;
};

export const SUGGESTED_TEMPLATES: SuggestedTemplate[] = [
  { id: "lead_question", label: "Bienvenida / pregunta", stage: "new_lead", mode: "text",
    body: "¡Hola! 😊 Gracias por escribirnos a Sanureva. ¿Qué te gustaría saber del producto? Estoy aquí para ayudarte.",
    explanation: "Friendly first reply; avoid making health claims." },
  { id: "followup_help", label: "Seguimiento amable", stage: "engaged", mode: "text",
    body: "¡Hola! 😊 ¿Pudiste revisar la información que te compartimos? Si tienes alguna duda, con gusto te ayudo.",
    explanation: "Only send if consent and WhatsApp conversation-window rules allow it." },
  { id: "read_no_reply", label: "Leyó y no respondió", stage: "read_no_reply", mode: "text",
    body: "Hola 😊 Vi que pudiste revisar mi mensaje. ¿Hay algo que quieras que te explique mejor?",
    explanation: "A read receipt does not prove the customer understood the text." },
  { id: "audio_offer", label: "Ofrecer explicación en audio", stage: "read_no_reply", mode: "audio_suggestion",
    body: "Si te resulta más cómodo, puedo explicártelo con una nota de voz cortita. ¿Te gustaría?",
    explanation: "Ask first. Sending voice notes requires an approved audio route and an open WhatsApp service window." },
  { id: "details_request", label: "Datos del pedido", stage: "awaiting_details", mode: "text",
    body: "¡Perfecto! Para preparar tu pedido, ¿me compartes tu nombre completo, departamento, municipio y dirección de entrega?",
    explanation: "Request only the information needed to fulfill the order." },
  { id: "confirm_order", label: "Confirmar pedido", stage: "order_placed", mode: "text",
    body: "¡Gracias por tu pedido! 😊 Te contactamos para confirmar los datos antes de preparar el envío.",
    explanation: "Order status must come from WooCommerce or an authorized operator." },
  { id: "tracking_update", label: "Información de seguimiento", stage: "confirmed", mode: "text",
    body: "¡Hola! Tu pedido está siendo preparado. En cuanto tengamos el número de guía te lo compartimos por aquí. 📦",
    explanation: "Does NOT claim shipment or delivery without carrier confirmation." },
  { id: "tracking_link", label: "Guía de rastreo", stage: "tracking_sent", mode: "text",
    body: "¡Hola! 📦 Ya tenemos la información de seguimiento de tu pedido: [ENLACE_O_NUMERO_DE_GUIA]. Puedes usarla para consultar el estado con la transportadora.",
    explanation: "Replace the placeholder using a verified tracking ID before sending." },
  { id: "delivery_check", label: "Seguimiento de entrega", stage: "in_delivery", mode: "text",
    body: "¡Hola! Tu pedido aparece en ruta de entrega. ¿La transportadora ya se comunicó contigo?",
    explanation: "Use only after a verified carrier / WooCommerce shipment event." },
  { id: "post_delivery", label: "Confirmación de recepción", stage: "delivered", mode: "text",
    body: "¡Hola! 😊 Queríamos confirmar que recibiste tu pedido correctamente. ¿Todo bien con la entrega?",
    explanation: "Post-delivery customer care, not proof of delivery." },
];

export interface PipelineContact {
  phone: string;
  name: string;
  stage: PipelineStage;
  stageEvidence: string;
  orderId: string;
  orderStatus: string;
  courierStatus: string;
  lastInboundAt: number;
  lastOutboundAt: number;
  lastActivityAt: number;
  readNoReply: boolean;
  hasOpenServiceWindow: boolean;
  conversationCount: number;
  messageCount: number;
  adsOrigin: boolean;
}

const lower = (v: unknown) => cleanDisplay(v).toLowerCase();
const whatsappInbound = (m: SheetRecord) => lower(m.Direction).includes("inbound");
const whatsappOutbound = (m: SheetRecord) => lower(m.Direction).includes("outbound");
const trackingPhrase = (message: SheetRecord) => {
  // Heuristic is shown as inferred, never proof of an actual carrier delivery.
  const t=lower(message["Message Content Snippet"]);
  return Boolean(t && (/gu[ií]a de rastreo|n[uú]mero de gu[ií]a|n[uú]mero de seguimiento|tracking (number|id)|seguimiento de tu pedido/.test(t)));
};

function stageFor(order: SheetRecord | undefined, thread: SheetRecord[]): { stage: PipelineStage; evidence: string } {
  const carrier = lower(order?.["Delivery Status"]);
  const woo = lower(order?.["WooCommerce Status"]);
  const wa = lower(order?.["WhatsApp Status"]);
  if (carrier === "delivered" || carrier === "entregado") return { stage: "delivered", evidence: "Delivery field reports delivered; verify carrier source" };
  if (["cancelled","canceled","failed","refunded"].includes(woo)) return {stage:"cancelled",evidence:"WooCommerce order state"};
  if (["out for delivery","in transit","shipped","en reparto","en tránsito","en transito"].includes(carrier)) return {stage:"in_delivery",evidence:"Delivery field reports shipment in progress"};
  // Tracking message is an inferred CRM stage, NOT carrier proof. An actual send callback is required for automation.
  if (order && thread.some(m => whatsappOutbound(m) && trackingPhrase(m) && ["sent","delivered","read"].includes(lower(m["Delivery Status"]))))
    return {stage:"tracking_sent",evidence:"Tracking text found in outbound WhatsApp log (inferred)"};
  if (order && (["confirmed","confirmado"].includes(wa) || ["processing","completed","on-hold"].includes(woo)))
    return {stage:"confirmed",evidence:"WooCommerce / WhatsApp confirmation"};
  if (order) return {stage:"order_placed",evidence:"WooCommerce order exists"};
  const last = thread[thread.length-1];
  if (last && whatsappInbound(last) && /direcci[oó]n|departamento|municipio|nombre completo/i.test(lower(last["Message Content Snippet"])))
    return {stage:"awaiting_details",evidence:"Conversation appears to discuss checkout details (inferred)"};
  if (thread.length>1) return {stage:"engaged",evidence:"WhatsApp conversation activity"};
  return {stage:"new_lead",evidence:"Only initial conversation activity recorded"};
}

export function deriveSalesPipeline(data: CrmSnapshot, now: number=Date.now()): PipelineContact[] {
  const grouped = new Map<string,{name:string;conversations:number;thread:SheetRecord[];orders:SheetRecord[];ad:boolean}>();
  const add=(phone:unknown,name:unknown)=>{
    const id=normalizePhone(phone);
    if(!id) return null;
    let value=grouped.get(id);
    if(!value){value={name:"",conversations:0,thread:[],orders:[],ad:false};grouped.set(id,value)}
    if(!value.name) value.name=cleanDisplay(name);
    return value;
  };
  for(const c of data.sheets[SHEET_NAMES.conversations]||[]){
    const value=add(c["Customer Phone"],c["Customer Name"]);
    if(value){value.conversations++;value.ad ||= /ad|anuncio|publicidad/i.test(cleanDisplay(c["Intent / Topic"]))}
  }
  for(const o of data.sheets[SHEET_NAMES.orders]||[]){
    const value=add(o["Phone Number"],o["Customer Name"]);
    if(value)value.orders.push(o);
  }
  for(const m of data.sheets[SHEET_NAMES.messages]||[]){
    if(!whatsappInbound(m)&&!whatsappOutbound(m))continue;
    const value=add(m["Customer Phone"],m["Customer Name"]);
    if(value)value.thread.push(m);
  }
  return [...grouped.entries()].map(([phone,c]):PipelineContact=>{
    const thread=[...c.thread].sort((a,b)=>dateValue(a.Timestamp)-dateValue(b.Timestamp));
    const order=[...c.orders].sort((a,b)=>dateValue(b["Date & Time"])-dateValue(a["Date & Time"]))[0];
    const inbound=thread.filter(whatsappInbound);
    const outbound=thread.filter(whatsappOutbound);
    const lastIn=inbound[inbound.length-1];
    const lastOut=outbound[outbound.length-1];
    const inAt=dateValue(lastIn?.Timestamp);
    const outAt=dateValue(lastOut?.Timestamp);
    const lastAt=Math.max(inAt,outAt,dateValue(order?.["Date & Time"]));
    const readNoReply=!!(outAt>inAt&&outAt>0&&["read"].includes(lower(lastOut?.["Delivery Status"]))&&now-outAt>=4*60*60*1000);
    const stage=stageFor(order,thread);
    return {phone,name:c.name||phone,stage:stage.stage,stageEvidence:stage.evidence,
      orderId:cleanDisplay(order?.["Order ID"]),orderStatus:cleanDisplay(order?.["WooCommerce Status"]),
      courierStatus:cleanDisplay(order?.["Delivery Status"]),lastInboundAt:inAt,lastOutboundAt:outAt,
      lastActivityAt:lastAt,readNoReply,hasOpenServiceWindow:inAt>0&&now-inAt<24*60*60*1000,
      conversationCount:c.conversations,messageCount:thread.length,adsOrigin:c.ad};
  }).sort((a,b)=>b.lastActivityAt-a.lastActivityAt);
}

export function templatesFor(contact:PipelineContact):SuggestedTemplate[]{
  const stages=new Set<string>([contact.stage,"engaged"]);
  if(contact.readNoReply)stages.add("read_no_reply");
  return SUGGESTED_TEMPLATES.filter(t=>stages.has(t.stage));
}
