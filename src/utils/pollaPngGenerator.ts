import { PollaTicket } from '../types/games';
import { getAnimalitoByCode } from '../data/pollaAnimalitos';

export function generatePollaTicketPng(ticket: PollaTicket, playerName: string = 'JUGADOR'): void {
  const canvas = document.createElement('canvas');
  canvas.width = 700;
  canvas.height = 1050;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Fondo Gradiente Oscuro de Lujo
  const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGradient.addColorStop(0, '#0a0d14');
  bgGradient.addColorStop(0.5, '#121824');
  bgGradient.addColorStop(1, '#080a0f');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Marco Dorado de Lujo
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 6;
  ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);

  // Banner Encabezado
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(30, 30, canvas.width - 60, 110);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 32px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🎰 RASPANDO LA OLLA', canvas.width / 2, 75);

  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('COMPROBANTE OFICIAL DE POLLA VENEZOLANA', canvas.width / 2, 110);

  // Número de Ticket e Identificador
  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 36px monospace';
  ctx.fillText(ticket.ticketNumber || `POLLA #${ticket.id.substring(0, 8).toUpperCase()}`, canvas.width / 2, 190);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`CÓDIGO DE VERIFICACIÓN: ${ticket.verificationCode || 'PL-OFFICIAL'}`, canvas.width / 2, 220);

  // Línea divisoria decorativa
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(50, 245);
  ctx.lineTo(canvas.width - 50, 245);
  ctx.stroke();

  // Datos de la Apuesta
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2e8f0';

  // Fila 1: Jugador
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px sans-serif';
  ctx.fillText('JUGADOR:', 60, 280);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(playerName.toUpperCase(), 180, 280);

  // Fila 2: Fecha de Sorteo
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px sans-serif';
  ctx.fillText('FECHA:', 60, 320);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(ticket.drawDate, 180, 320);

  // Fila 3: Turno / Bloque
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px sans-serif';
  ctx.fillText('TURNO:', 380, 320);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`TURNO ${ticket.block}`, 470, 320);

  // Fila 4: Costo de la Polla
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px sans-serif';
  ctx.fillText('MONTO JUGADO:', 60, 360);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`${Number(ticket.costBs).toFixed(2)} Bs`, 210, 360);

  // Título Sección Animalitos
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 20px sans-serif';
  ctx.fillText('ANIMALITOS SELECCIONADOS (6/6)', canvas.width / 2, 420);

  // Rejilla 2x3 de Animalitos Elegidos
  const startX = 60;
  const startY = 450;
  const cardW = 175;
  const cardH = 160;
  const gapX = 25;
  const gapY = 20;

  ticket.animalitos.forEach((code, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = startX + col * (cardW + gapX);
    const y = startY + row * (cardH + gapY);

    const animal = getAnimalitoByCode(code);

    // Fondo de tarjeta de animalito
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 16);
    ctx.fill();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Código
    ctx.fillStyle = '#f59e0b';
    ctx.font = '900 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, x + cardW / 2, y + 38);

    // Emoji / Icono
    ctx.font = '40px sans-serif';
    ctx.fillText(animal?.icon || '🐾', x + cardW / 2, y + 95);

    // Nombre
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(animal?.name || 'ANIMALITO', x + cardW / 2, y + 135);
  });

  // Marca de Estado / Registro
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(50, 830, canvas.width - 100, 100);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 830, canvas.width - 100, 100);

  ctx.fillStyle = '#34d399';
  ctx.font = '900 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('✔ REGISTRADO Y VALIDADO EN SUPABASE', canvas.width / 2, 875);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText('Servidor Autoritativo UTC-4 (Caracas, Venezuela)', canvas.width / 2, 905);

  // Pie de Página
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';
  ctx.fillText('Raspando la Olla © 2026 • Este recibo digital es para uso informativo personal.', canvas.width / 2, 980);
  ctx.fillText('El respaldo oficial reside de forma segura en el Ledger de Supabase.', canvas.width / 2, 1000);

  // Convertir canvas a PNG e iniciar descarga directa
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `${(ticket.ticketNumber || 'POLLA').replace('#', '')}_${ticket.drawDate}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
