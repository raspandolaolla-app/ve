// ==============================================================================
// RASPANDO LA OLLA — ONBOARDING DE PERFILADO ESTRICTO Y BLINDAJE DE IDENTIDAD
// ==============================================================================

import React, { useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../../features/auth/AuthContext';
import {
  User,
  Phone,
  Calendar,
  MapPin,
  IdCard,
  AlertCircle,
  ShieldCheck,
  Lock,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

const ESTADOS_VENEZUELA = [
  'Amazonas',
  'Anzoátegui',
  'Apure',
  'Aragua',
  'Barinas',
  'Bolívar',
  'Carabobo',
  'Cojedes',
  'Delta Amacuro',
  'Distrito Capital',
  'Falcón',
  'Guárico',
  'Lara',
  'Mérida',
  'Miranda',
  'Monagas',
  'Nueva Esparta',
  'Portuguesa',
  'Sucre',
  'Táchira',
  'Trujillo',
  'La Guaira',
  'Yaracuy',
  'Zulia',
];

interface ProfileOnboardingProps {
  onComplete: () => void;
}

export const ProfileOnboarding: React.FC<ProfileOnboardingProps> = ({ onComplete }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [formData, setFormData] = useState({
    cedula: profile?.cedula || '',
    telefono: profile?.telefono || '',
    nombre_real: profile?.nombreReal || (profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}`.trim() : ''),
    fecha_nacimiento: profile?.fechaNacimiento || (profile?.birthDate ? String(profile.birthDate) : ''),
    estado_residencia: profile?.estadoResidencia || profile?.state || 'Distrito Capital',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const cleanCedula = formData.cedula.replace(/\D/g, '');
    const cleanPhone = formData.telefono.trim();
    const cleanName = formData.nombre_real.trim().toUpperCase();

    // 1. Validación de cédula (7 a 9 dígitos)
    if (!/^\d{7,9}$/.test(cleanCedula)) {
      setError('Ingresa una cédula venezolana válida (7 a 9 dígitos numéricos, sin puntos ni letras).');
      setIsLoading(false);
      return;
    }

    // 2. Validación de teléfono
    if (cleanPhone.length < 10) {
      setError('Ingresa un número de teléfono válido (ej. 0414-1234567 o 04121234567).');
      setIsLoading(false);
      return;
    }

    // 3. Validación de nombre
    if (cleanName.length < 5 || !cleanName.includes(' ')) {
      setError('Por favor escribe tus nombres y apellidos completos tal como figuran en tu cédula.');
      setIsLoading(false);
      return;
    }

    // 4. Validación de fecha y mayoría de edad (+18 años)
    if (!formData.fecha_nacimiento) {
      setError('Debes ingresar tu fecha de nacimiento.');
      setIsLoading(false);
      return;
    }

    const birth = new Date(formData.fecha_nacimiento);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    if (age < 18) {
      setError('Debes ser mayor de 18 años para registrarte y participar en la plataforma.');
      setIsLoading(false);
      return;
    }

    // 5. Validación de estado de residencia
    if (!formData.estado_residencia) {
      setError('Por favor selecciona tu estado de residencia en Venezuela.');
      setIsLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('No se pudo conectar con la base de datos.');
      setIsLoading(false);
      return;
    }

    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      const targetUserId = currentUser?.id || user?.id;

      if (!targetUserId) {
        throw new Error('No se encontró una sesión activa de usuario.');
      }

      const nameParts = cleanName.split(' ');
      const firstName = nameParts[0] || 'Jugador';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const cedulaLast4 = cleanCedula.slice(-4);
      const now = new Date().toISOString();

      const updatePayload = {
        cedula: cleanCedula,
        telefono: cleanPhone,
        nombre_real: cleanName,
        fecha_nacimiento: formData.fecha_nacimiento,
        estado_residencia: formData.estado_residencia,
        is_profile_locked: true,
        first_name: firstName,
        last_name: lastName,
        display_name: cleanName,
        phone_number: cleanPhone,
        state_venezuela: formData.estado_residencia,
        birth_date: formData.fecha_nacimiento,
        cedula_last4: cedulaLast4,
        account_status: 'ACTIVE',
        updated_at: now,
      };

      // Intentar actualizar por user_id
      let { error: updateError, count } = await supabase
        .from('profiles')
        .update(updatePayload, { count: 'exact' })
        .eq('user_id', targetUserId);

      // Si count es 0 o error, intentar por id
      if (!updateError && (count === 0 || count === null)) {
        const fallbackRes = await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', targetUserId);
        updateError = fallbackRes.error;
      }

      if (updateError) {
        // ERROR 23505: Violación de restricción UNIQUE (Cédula o Teléfono duplicado)
        if (
          updateError.code === '23505' ||
          updateError.message?.includes('duplicate key') ||
          updateError.message?.includes('unique')
        ) {
          const detailStr = (updateError.message || '') + (updateError.details || '');
          if (detailStr.toLowerCase().includes('cedula')) {
            throw new Error('Esta cédula de identidad ya está registrada en otra cuenta. Verifica tu número.');
          }
          if (detailStr.toLowerCase().includes('telefono')) {
            throw new Error('Este número de teléfono ya está registrado en otra cuenta.');
          }
          throw new Error('Ya existen registros con estos datos. No se permiten cuentas duplicadas.');
        }

        if (updateError.message?.includes('NO_AUTORIZADO')) {
          throw new Error('Tus datos de identidad ya están blindados y no pueden ser modificados. Contacta a soporte.');
        }

        throw updateError;
      }

      setSuccess(true);
      await refreshProfile();

      setTimeout(() => {
        onComplete();
      }, 1200);
    } catch (err: any) {
      console.error('[ProfileOnboarding] Error guardando perfil:', err);
      setError(err.message || 'Error al guardar los datos del perfil. Por favor intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 overflow-y-auto">
      <div className="max-w-xl w-full bg-[#111724] border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative my-auto animate-in fade-in zoom-in-95">
        {/* ENCABEZADO */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <User className="w-8 h-8 text-amber-400" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black tracking-wider uppercase">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verificación Obligatoria de Identidad</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Completa tu Perfil
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
            Para cumplir con las normas de seguridad y cobro de premios en Venezuela, registra tus datos oficiales.
          </p>
          <div className="flex items-center justify-center gap-2 text-[11px] text-amber-300/90 font-bold bg-amber-500/10 border border-amber-500/20 py-1.5 px-3 rounded-xl max-w-md mx-auto">
            <Lock className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>Tu cédula y teléfono quedarán blindados contra modificaciones no autorizadas.</span>
          </div>
        </div>

        {/* FEEDBACK DE ERROR */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs font-bold animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* FEEDBACK DE ÉXITO */}
        {success && (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <span>¡Datos verificados y guardados con éxito! Ingresando a la plataforma...</span>
          </div>
        )}

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* CÉDULA Y TELÉFONO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-300 mb-1.5 block uppercase tracking-wider">
                Cédula de Identidad (V / E)
              </label>
              <div className="relative">
                <IdCard className="absolute left-3.5 top-3.5 w-4 h-4 text-amber-400/80" />
                <input
                  type="text"
                  required
                  value={formData.cedula}
                  onChange={(e) =>
                    setFormData({ ...formData, cedula: e.target.value.replace(/\D/g, '') })
                  }
                  className="w-full bg-[#0B0F17] border border-slate-700/90 focus:border-amber-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none transition-colors"
                  placeholder="Ej: 12345678"
                  maxLength={9}
                  disabled={isLoading || success}
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Solo números, sin puntos ni letras.</span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1.5 block uppercase tracking-wider">
                Teléfono de Contacto
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-amber-400/80" />
                <input
                  type="tel"
                  required
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-700/90 focus:border-amber-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none transition-colors"
                  placeholder="Ej: 0414-1234567"
                  disabled={isLoading || success}
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Móvil para coordinar retiros y Pago Móvil.</span>
            </div>
          </div>

          {/* NOMBRE REAL COMPLETO */}
          <div>
            <label className="text-xs font-bold text-slate-300 mb-1.5 block uppercase tracking-wider">
              Nombres y Apellidos Completos (Según Documento)
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 w-4 h-4 text-amber-400/80" />
              <input
                type="text"
                required
                value={formData.nombre_real}
                onChange={(e) => setFormData({ ...formData, nombre_real: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-700/90 focus:border-amber-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none transition-colors uppercase"
                placeholder="EJ: JUAN ALBERTO PÉREZ RODRÍGUEZ"
                disabled={isLoading || success}
              />
            </div>
          </div>

          {/* FECHA DE NACIMIENTO Y ESTADO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-300 mb-1.5 block uppercase tracking-wider">
                Fecha de Nacimiento (+18)
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-3.5 w-4 h-4 text-amber-400/80" />
                <input
                  type="date"
                  required
                  value={formData.fecha_nacimiento}
                  onChange={(e) =>
                    setFormData({ ...formData, fecha_nacimiento: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-slate-700/90 focus:border-amber-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none transition-colors [color-scheme:dark]"
                  disabled={isLoading || success}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 mb-1.5 block uppercase tracking-wider">
                Estado de Residencia
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-amber-400/80" />
                <select
                  required
                  value={formData.estado_residencia}
                  onChange={(e) =>
                    setFormData({ ...formData, estado_residencia: e.target.value })
                  }
                  className="w-full bg-[#0B0F17] border border-slate-700/90 focus:border-amber-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none transition-colors"
                  disabled={isLoading || success}
                >
                  <option value="">Selecciona tu estado</option>
                  {ESTADOS_VENEZUELA.map((estado) => (
                    <option key={estado} value={estado}>
                      {estado}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* BOTÓN CONFIRMAR */}
          <button
            type="submit"
            disabled={isLoading || success}
            className="w-full py-3.5 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl 
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Verificando y Blindando Perfil...</span>
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                <span>¡Perfil Registrado!</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-slate-950" />
                <span>CONFIRMAR Y BLINDAR DATOS</span>
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[11px] text-slate-500 leading-relaxed">
          Tus datos se encuentran resguardados con cifrado y estrictos protocolos de protección al consumidor y juego transparente.
        </p>
      </div>
    </div>
  );
};
