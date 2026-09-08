import React, { useState } from 'react';
import { supabase as exportedSupabase, getSupabaseClient } from '../../lib/supabase/client';
import { useAuth } from '../../features/auth/AuthContext';
import {
  User,
  Phone,
  Calendar,
  MapPin,
  IdCard,
  AlertCircle,
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
    nombre_real:
      profile?.nombreReal ||
      (profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}`.trim() : ''),
    fecha_nacimiento: profile?.fechaNacimiento || (profile?.birthDate ? String(profile.birthDate) : ''),
    estado_residencia: profile?.estadoResidencia || profile?.state || 'Distrito Capital',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    // 1. Validación estricta de formato de cédula (solo números, 7 a 9 dígitos)
    const cedulaLimpia = formData.cedula.replace(/\./g, '').replace(/\D/g, '');
    if (cedulaLimpia.length < 7 || cedulaLimpia.length > 9) {
      setError('⚠️ Ingresa una cédula válida (solo números, entre 7 y 9 dígitos).');
      setIsLoading(false);
      return;
    }

    // 2. Validación de teléfono
    const telefonoLimpio = formData.telefono.trim();
    if (telefonoLimpio.length < 10) {
      setError('⚠️ Ingresa un número de teléfono válido (ej. 04141234567).');
      setIsLoading(false);
      return;
    }

    // 3. Validación de nombre
    const nombreLimpio = formData.nombre_real.trim().toUpperCase();
    if (nombreLimpio.length < 5 || !nombreLimpio.includes(' ')) {
      setError('⚠️ Escribe tus nombres y apellidos completos tal como figuran en tu documento.');
      setIsLoading(false);
      return;
    }

    // 4. Validación de fecha y mayoría de edad (+18 años)
    if (!formData.fecha_nacimiento) {
      setError('⚠️ Debes ingresar tu fecha de nacimiento.');
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
      setError('⚠️ Debes ser mayor de 18 años para participar en la plataforma.');
      setIsLoading(false);
      return;
    }

    // 5. Validación de estado de residencia
    if (!formData.estado_residencia) {
      setError('⚠️ Por favor selecciona tu estado de residencia en Venezuela.');
      setIsLoading(false);
      return;
    }

    try {
      // Soporte para pruebas E2E con Mock Auth
      if (typeof window !== 'undefined' && window.localStorage.getItem('playwright-mock-auth')) {
        const nameParts = nombreLimpio.split(' ');
        const firstName = nameParts[0] || 'Robot';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Test';
        const currentMock = JSON.parse(window.localStorage.getItem('playwright-mock-auth') || '{}');
        currentMock.profile = {
          ...(currentMock.profile || {}),
          cedula: cedulaLimpia,
          telefono: telefonoLimpio,
          nombreReal: nombreLimpio,
          firstName,
          lastName,
          fechaNacimiento: formData.fecha_nacimiento,
          estadoResidencia: formData.estado_residencia,
          isProfileLocked: true,
          identityVerificationStatus: 'approved',
          humanVerificationStatus: 'approved',
        };
        window.localStorage.setItem('playwright-mock-auth', JSON.stringify(currentMock));
        setSuccess('✅ Perfil guardado exitosamente. Redirigiendo...');
        await refreshProfile();
        onComplete();
        return;
      }

      const client = exportedSupabase || getSupabaseClient();
      if (!client) {
        throw new Error('El servicio de base de datos no está disponible.');
      }

      const {
        data: { user: authUser },
      } = await client.auth.getUser();

      const activeUserId = authUser?.id || user?.id;
      if (!activeUserId) {
        throw new Error('No hay sesión activa. Por favor, inicia sesión de nuevo.');
      }

      const nameParts = nombreLimpio.split(' ');
      const firstName = nameParts[0] || 'Jugador';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const cedulaLast4 = cedulaLimpia.slice(-4);
      const now = new Date().toISOString();

      const updatePayload = {
        cedula: cedulaLimpia,
        telefono: telefonoLimpio,
        nombre_real: nombreLimpio,
        fecha_nacimiento: formData.fecha_nacimiento,
        estado_residencia: formData.estado_residencia,
        is_profile_locked: true,
        first_name: firstName,
        last_name: lastName,
        display_name: nombreLimpio,
        phone_number: telefonoLimpio,
        state_venezuela: formData.estado_residencia,
        birth_date: formData.fecha_nacimiento,
        cedula_last4: cedulaLast4,
        account_status: 'ACTIVE',
        updated_at: now,
      };

      // 2. Usamos .update() estrictamente, NO .upsert() ni .insert()
      // El trigger de Supabase ya debió crear la fila base al registrarse con Google.
      let { data, error: updateError } = await client
        .from('profiles')
        .update(updatePayload)
        .eq('id', activeUserId)
        .select()
        .maybeSingle();

      // Compatibilidad con esquemas donde la clave de usuario en profiles sea user_id
      if (!updateError && !data) {
        const retry = await client
          .from('profiles')
          .update(updatePayload)
          .eq('user_id', activeUserId)
          .select()
          .maybeSingle();
        data = retry.data;
        updateError = retry.error;
      }

      if (updateError) {
        // 3. MANEJO DE ERRORES CLAROS Y AMIGABLES
        if (updateError.code === '23505') {
          // Violación de restricción UNIQUE
          const msg =
            (updateError.message || '').toLowerCase() +
            ' ' +
            (updateError.details?.toLowerCase() || '');
          if (msg.includes('cedula') || msg.includes('profiles_cedula_unique') || msg.includes('cedula_hash')) {
            throw new Error(
              '⚠️ Esta cédula ya está registrada en otro perfil. Cada persona solo puede tener una cuenta. Verifica el número o contacta a soporte.'
            );
          }
          if (msg.includes('telefono') || msg.includes('profiles_telefono_unique')) {
            throw new Error(
              '⚠️ Este número de teléfono ya está registrado en otro perfil. Verifica el número o contacta a soporte.'
            );
          }
          throw new Error('⚠️ Ya existen registros con estos datos. No se permiten perfiles duplicados.');
        }

        if (updateError.code === '42501') {
          // Violación de RLS
          throw new Error(
            '⚠️ Error de permisos: No tienes autorización para modificar este perfil. Cierra sesión y vuelve a intentarlo.'
          );
        }

        if (updateError.message?.includes('NO_AUTORIZADO')) {
          throw new Error(
            '⚠️ Tus datos de identidad ya están blindados en el sistema y no pueden ser modificados. Contacta a soporte si requieres asistencia.'
          );
        }

        throw new Error(`Error al guardar: ${updateError.message}`);
      }

      // Éxito
      setSuccess('✅ Perfil guardado exitosamente. Redirigiendo...');
      await refreshProfile();
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: any) {
      console.error('Error en onboarding:', err);
      setError(err.message || 'Ocurrió un error inesperado. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0F17]/95 backdrop-blur-md p-4 overflow-y-auto">
      <div className="max-w-lg w-full p-6 md:p-8 bg-[#131926] border border-amber-500/30 rounded-3xl space-y-6 shadow-2xl my-auto animate-in fade-in zoom-in-95">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-2 border border-amber-500/30 shadow-inner">
            <User className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Completa tu Perfil</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Para cumplir con las regulaciones de juego responsable, necesitamos verificar tu identidad.
            <span className="text-amber-400 font-bold block mt-2 text-xs uppercase tracking-wide">
              ⚠️ La cédula y el teléfono no podrán ser modificados después de guardar.
            </span>
          </p>
        </div>

        {/* Mensajes de Error o Éxito */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-bold animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm font-bold animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">
                Cédula de Identidad
              </label>
              <div className="relative">
                <IdCard className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  required
                  data-testid="onboarding-cedula"
                  value={formData.cedula}
                  onChange={(e) =>
                    setFormData({ ...formData, cedula: e.target.value.replace(/\D/g, '') })
                  }
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl pl-11 pr-4 py-3.5 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all placeholder:text-slate-600"
                  placeholder="Número de cédula (Ej: 12345678)"
                  maxLength={9}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">
                Teléfono
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500" />
                <input
                  type="tel"
                  required
                  data-testid="onboarding-telefono"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl pl-11 pr-4 py-3.5 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all placeholder:text-slate-600"
                  placeholder="Número de teléfono (Ej: 04141234567)"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">
              Nombre Real (Como aparece en tu documento)
            </label>
            <input
              type="text"
              required
              data-testid="onboarding-nombre"
              value={formData.nombre_real}
              onChange={(e) => setFormData({ ...formData, nombre_real: e.target.value })}
              className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl px-4 py-3.5 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all placeholder:text-slate-600 uppercase"
              placeholder="Nombres y apellidos completos"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">
                Fecha de Nacimiento
              </label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500" />
                <input
                  type="date"
                  required
                  data-testid="onboarding-fecha-nacimiento"
                  value={formData.fecha_nacimiento}
                  onChange={(e) => setFormData({ ...formData, fecha_nacimiento: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl pl-11 pr-4 py-3.5 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all [color-scheme:dark]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">
                Estado de Residencia
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-500" />
                <select
                  required
                  data-testid="onboarding-estado"
                  value={formData.estado_residencia}
                  onChange={(e) => setFormData({ ...formData, estado_residencia: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-700 rounded-xl pl-11 pr-4 py-3.5 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all appearance-none"
                >
                  <option value="">Selecciona tu estado</option>
                  {ESTADOS_VENEZUELA.map((estado) => (
                    <option key={estado} value={estado} className="bg-[#131926]">
                      {estado}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            data-testid="onboarding-submit"
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-base sm:text-lg rounded-xl 
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 transition-all mt-4 flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-950"></span>
                <span>Verificando y Guardando...</span>
              </>
            ) : (
              'CONFIRMAR Y GUARDAR DATOS'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
