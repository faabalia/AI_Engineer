import { filasEjemplo } from "../ejemplo.js";
import { UMBRAL_ACIERTO } from "../informe.js";
import { avisoErrores, formatearTabla } from "../tabla.js";

// Pinta el informe con datos fijos: no usa el proxy ni el .env.
console.log(`Umbral de acierto medio: ${UMBRAL_ACIERTO}%\n`);
console.log(formatearTabla(filasEjemplo));
console.log(`\n${avisoErrores(filasEjemplo)}`);
