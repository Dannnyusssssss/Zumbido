/** Todos los textos visibles para el jugador. */
export const TEXTS = {
  start: {
    subtitle: 'Pasillos que no terminan. Luces que zumban. Algo escucha.',
    play: 'Haz clic para jugar',
    warningTitle: 'Aviso de contenido',
    warning:
      'Oscuridad, tensión, espacios cerrados, luces parpadeantes suaves y sonido envolvente. Sin sangre ni imágenes explícitas.',
    warningLink: 'Puedes desactivar el parpadeo y el movimiento de cámara en los ajustes.',
    instructionsTitle: 'Controles',
    instructions: [
      'WASD: moverse',
      'Ratón o flechas: mirar',
      'Shift: correr',
      'C: agacharse',
      'Esc o P: pausa',
      'M: silenciar',
    ],
    loading: 'Cargando…',
  },
  pause: {
    title: 'Pausa',
    resume: 'Haz clic para continuar',
    settings: 'Ajustes',
    seed: 'Semilla',
  },
  settings: {
    title: 'Ajustes',
    back: 'Volver',
    muted: 'Silenciar sonido (M)',
    reduceFlicker: 'Reducir parpadeo',
    reduceMotion: 'Reducir movimiento',
    sensitivity: 'Sensibilidad del ratón',
    invertY: 'Invertir eje vertical',
    fov: 'Campo de visión',
    quality: 'Calidad',
    crosshair: 'Punto central',
    qualityLow: 'Baja',
    qualityMedium: 'Media',
    qualityHigh: 'Alta',
    saveFailed: 'No se pudieron guardar los ajustes en este navegador.',
  },
  notices: {
    pointerLockFailed:
      'No se pudo capturar el ratón. Puedes girar con las flechas o hacer clic de nuevo.',
    muted: 'Sonido silenciado',
    unmuted: 'Sonido activado',
  },
  errors: {
    noWebGL:
      'Tu navegador no puede mostrar gráficos 3D (WebGL no está disponible). Prueba a activar la aceleración por hardware o a usar otro navegador.',
    contextLost: 'Se perdió el contexto gráfico. Esperando a que el navegador lo recupere…',
  },
} as const;
