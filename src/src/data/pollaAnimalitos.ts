// ==============================================================================
// RASPANDO LA OLLA — CATALOGO DE 77 ANIMALITOS VENEZOLANOS (POLLA VENEZOLANA)
// ==============================================================================

export interface Animalito {
  code: string; // '00' a '76'
  name: string;
  icon: string;
  group: string;
}

export const ANIMALITOS_CATALOG: Animalito[] = [
  // GRUPO A1 (00 - 08)
  { code: '00', name: 'Ballena', icon: '🐋', group: 'A1' },
  { code: '01', name: 'Delfín', icon: '🐬', group: 'A1' },
  { code: '02', name: 'Carnero', icon: '🐑', group: 'A1' },
  { code: '03', name: 'Toro', icon: '🐂', group: 'A1' },
  { code: '04', name: 'Ciempíes', icon: '🐛', group: 'A1' },
  { code: '05', name: 'Alacrán', icon: '🦂', group: 'A1' },
  { code: '06', name: 'León', icon: '🦁', group: 'A1' },
  { code: '07', name: 'Rana', icon: '🐸', group: 'A1' },
  { code: '08', name: 'Perico', icon: '🦜', group: 'A1' },

  // GRUPO B1 (09 - 17)
  { code: '09', name: 'Ratón', icon: '🐭', group: 'B1' },
  { code: '10', name: 'Águila', icon: '🦅', group: 'B1' },
  { code: '11', name: 'Tigre', icon: '🐅', group: 'B1' },
  { code: '12', name: 'Gato', icon: '🐈', group: 'B1' },
  { code: '13', name: 'Caballo', icon: '🐎', group: 'B1' },
  { code: '14', name: 'Mono', icon: '🐒', group: 'B1' },
  { code: '15', name: 'Paloma', icon: '🕊️', group: 'B1' },
  { code: '16', name: 'Zorro', icon: '🦊', group: 'B1' },
  { code: '17', name: 'Oso', icon: '🐻', group: 'B1' },

  // GRUPO C1 (18 - 26)
  { code: '18', name: 'Pavo', icon: '🦃', group: 'C1' },
  { code: '19', name: 'Burro', icon: '🫏', group: 'C1' },
  { code: '20', name: 'Chivo', icon: '🐐', group: 'C1' },
  { code: '21', name: 'Cochino', icon: '🐖', group: 'C1' },
  { code: '22', name: 'Gallo', icon: '🐓', group: 'C1' },
  { code: '23', name: 'Camello', icon: '🐪', group: 'C1' },
  { code: '24', name: 'Cebra', icon: '🦓', group: 'C1' },
  { code: '25', name: 'Iguana', icon: '🦎', group: 'C1' },
  { code: '26', name: 'Gallina', icon: '🐔', group: 'C1' },

  // GRUPO D1 (27 - 35)
  { code: '27', name: 'Vaca', icon: '🐄', group: 'D1' },
  { code: '28', name: 'Perro', icon: '🐕', group: 'D1' },
  { code: '29', name: 'Zamuro', icon: '🦅', group: 'D1' },
  { code: '30', name: 'Elefante', icon: '🐘', group: 'D1' },
  { code: '31', name: 'Caimán', icon: '🐊', group: 'D1' },
  { code: '32', name: 'Lapa', icon: '🦫', group: 'D1' },
  { code: '33', name: 'Ardilla', icon: '🐿️', group: 'D1' },
  { code: '34', name: 'Pescado', icon: '🐟', group: 'D1' },
  { code: '35', name: 'Venado', icon: '🦌', group: 'D1' },

  // GRUPO E1 (36 - 44)
  { code: '36', name: 'Jirafa', icon: '🦒', group: 'E1' },
  { code: '37', name: 'Culebra', icon: '🐍', group: 'E1' },
  { code: '38', name: 'Tortuga', icon: '🐢', group: 'E1' },
  { code: '39', name: 'Búfalo', icon: '🦬', group: 'E1' },
  { code: '40', name: 'Lechuza', icon: '🦉', group: 'E1' },
  { code: '41', name: 'Avispa', icon: '🐝', group: 'E1' },
  { code: '42', name: 'Canguro', icon: '🦘', group: 'E1' },
  { code: '43', name: 'Tucán', icon: '🦜', group: 'E1' },
  { code: '44', name: 'Mariposa', icon: '🦋', group: 'E1' },

  // GRUPO F1 (45 - 53)
  { code: '45', name: 'Chigüire', icon: '🦫', group: 'F1' },
  { code: '46', name: 'Garza', icon: '🦩', group: 'F1' },
  { code: '47', name: 'Puma', icon: '🐆', group: 'F1' },
  { code: '48', name: 'Pavo Real', icon: '🦚', group: 'F1' },
  { code: '49', name: 'Puercoespín', icon: '🦔', group: 'F1' },
  { code: '50', name: 'Perezoso', icon: '🦥', group: 'F1' },
  { code: '51', name: 'Canario', icon: '🐤', group: 'F1' },
  { code: '52', name: 'Pelícano', icon: '🦤', group: 'F1' },
  { code: '53', name: 'Pulpo', icon: '🐙', group: 'F1' },

  // GRUPO G1 (54 - 62)
  { code: '54', name: 'Caracol', icon: '🐌', group: 'G1' },
  { code: '55', name: 'Grillo', icon: '🦗', group: 'G1' },
  { code: '56', name: 'Oso Hormiguero', icon: '🦡', group: 'G1' },
  { code: '57', name: 'Tiburón', icon: '🦈', group: 'G1' },
  { code: '58', name: 'Pato', icon: '🦆', group: 'G1' },
  { code: '59', name: 'Hormiga', icon: '🐜', group: 'G1' },
  { code: '60', name: 'Pantera', icon: '🐈‍⬛', group: 'G1' },
  { code: '61', name: 'Camaleón', icon: '🦎', group: 'G1' },
  { code: '62', name: 'Panda', icon: '🐼', group: 'G1' },

  // GRUPO H1 (63 - 71)
  { code: '63', name: 'Cachicamo', icon: '🦔', group: 'H1' },
  { code: '64', name: 'Cangrejo', icon: '🦀', group: 'H1' },
  { code: '65', name: 'Gavilán', icon: '🦅', group: 'H1' },
  { code: '66', name: 'Araña', icon: '🕷️', group: 'H1' },
  { code: '67', name: 'Lobo', icon: '🐺', group: 'H1' },
  { code: '68', name: 'Avestruz', icon: '🦩', group: 'H1' },
  { code: '69', name: 'Jaguar', icon: '🐆', group: 'H1' },
  { code: '70', name: 'Conejo', icon: '🐇', group: 'H1' },
  { code: '71', name: 'Bisonte', icon: '🦬', group: 'H1' },

  // GRUPO I1 (72 - 76)
  { code: '72', name: 'Guacamaya', icon: '🦜', group: 'I1' },
  { code: '73', name: 'Gorila', icon: '🦍', group: 'I1' },
  { code: '74', name: 'Hipopótamo', icon: '🦛', group: 'I1' },
  { code: '75', name: 'Turpial', icon: '🐥', group: 'I1' },
  { code: '76', name: 'Guácharo', icon: '🦇', group: 'I1' },
];

export const getAnimalitoByCode = (code: string): Animalito | undefined => {
  return ANIMALITOS_CATALOG.find((a) => a.code === code);
};
