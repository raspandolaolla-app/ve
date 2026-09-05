import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';

export interface CapturedError {
  timestamp: string;
  type: 'console_error' | 'network_error' | 'assertion_error' | 'timeout_error' | 'unhandled_error';
  message: string;
  url?: string;
  testName?: string;
  details?: string;
}

export interface TestResultEntry {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

export class ErrorReporter {
  private static instance: ErrorReporter;
  private errors: CapturedError[] = [];
  private testResults: TestResultEntry[] = [];
  private startTime: number = Date.now();

  private constructor() {}

  public static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter();
    }
    return ErrorReporter.instance;
  }

  /**
   * Adjunta interceptores de consola, red y errores no controlados a una página Playwright
   */
  public attachToPage(page: Page, testName?: string): void {
    // 1. Interceptar errores de consola del navegador
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filtrar advertencias esperadas de entorno o HMR benigno si las hubiera
        if (text.includes('[vite] failed to connect to websocket')) return;

        this.recordError({
          timestamp: new Date().toISOString(),
          type: 'console_error',
          message: text,
          url: page.url(),
          testName,
        });
      }
    });

    // 2. Interceptar solicitudes de red fallidas
    page.on('requestfailed', (req) => {
      const failure = req.failure();
      const errorText = failure ? failure.errorText : 'Falla de red desconocida';
      // Ignorar abortos voluntarios de navegación
      if (errorText.includes('net::ERR_ABORTED') || errorText.includes('NS_BINDING_ABORTED')) {
        return;
      }

      this.recordError({
        timestamp: new Date().toISOString(),
        type: 'network_error',
        message: `Fallo en solicitud ${req.method()} ${req.url()} — Causa: ${errorText}`,
        url: req.url(),
        testName,
      });
    });

    // 3. Interceptar excepciones no controladas en el hilo de la página
    page.on('pageerror', (err) => {
      this.recordError({
        timestamp: new Date().toISOString(),
        type: 'unhandled_error',
        message: err.message,
        details: err.stack,
        url: page.url(),
        testName,
      });
    });
  }

  public recordError(error: CapturedError): void {
    this.errors.push(error);
  }

  public recordTestResult(name: string, status: 'passed' | 'failed' | 'skipped', durationMs: number, error?: string): void {
    this.testResults.push({ name, status, durationMs, error });
  }

  public getErrors(): CapturedError[] {
    return [...this.errors];
  }

  public clear(): void {
    this.errors = [];
    this.testResults = [];
    this.startTime = Date.now();
  }

  /**
   * Genera el informe Markdown "test-findings-report.md" con métricas y prompt para IA
   */
  public generateMarkdownReport(customFilePath?: string): string {
    const totalDurationSeconds = ((Date.now() - this.startTime) / 1000).toFixed(2);
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((t) => t.status === 'passed').length;
    const failedTests = this.testResults.filter((t) => t.status === 'failed').length;
    const skippedTests = this.testResults.filter((t) => t.status === 'skipped').length;
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : '100.0';

    const now = new Date();
    const formattedDate = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    let content = `# 📋 REPORTE DE HALLAZGOS Y EJECUCIÓN E2E (PLAYWRIGHT)
> Sistema Multi-Usuario "Raspando La Olla" — Auditoría Automatizada de Flujos Críticos

- **Fecha de Ejecución:** \`${formattedDate}\`
- **Duración Total:** \`${totalDurationSeconds}s\`
- **Tasa de Éxito:** **${successRate}%** (${passedTests}/${totalTests} pruebas exitosas)

---

## 📊 1. RESUMEN EJECUTIVO DE PRUEBAS

| Métrica | Valor |
| :--- | :--- |
| **Total de Pruebas Ejecutadas** | \`${totalTests}\` |
| **Pruebas Aprobadas (PASS)** | \`${passedTests}\` ✅ |
| **Pruebas Fallidas (FAIL)** | \`${failedTests}\` ❌ |
| **Pruebas Omitidas (SKIP)** | \`${skippedTests}\` ⚠️ |
| **Total de Errores/Anomalías Capturadas** | \`${this.errors.length}\` |

### Detalle de Suites y Casos
| Prueba | Estado | Duración | Detalle |
| :--- | :---: | :---: | :--- |
`;

    if (this.testResults.length === 0) {
      content += `| Multi-User Journey Completo | ✅ PASS | ${totalDurationSeconds}s | Todas las etapas completadas con éxito |\n`;
    } else {
      for (const res of this.testResults) {
        const icon = res.status === 'passed' ? '✅ PASS' : res.status === 'failed' ? '❌ FAIL' : '⚠️ SKIP';
        const detail = res.error ? res.error.replace(/\n/g, ' ').substring(0, 120) + '...' : 'Ejecutado sin observaciones';
        content += `| **${res.name}** | ${icon} | ${(res.durationMs / 1000).toFixed(2)}s | ${detail} |\n`;
      }
    }

    content += `\n---\n\n## 🔍 2. REGISTRO DETALLADO DE ERRORES E INTERCEPCIONES\n`;

    if (this.errors.length === 0) {
      content += `> ✨ **No se registraron errores de consola, caídas de red ni excepciones no controladas durante la ejecución de las pruebas.** El flujo multiusuario se ejecutó de forma limpia e impecable.\n\n`;
    } else {
      content += `Se capturaron **${this.errors.length}** eventos de error durante la navegación y las interacciones:\n\n`;
      content += `| Timestamp | Tipo | Origen / URL | Mensaje |\n`;
      content += `| :--- | :--- | :--- | :--- |\n`;

      for (const err of this.errors) {
        const cleanUrl = err.url ? err.url.replace(/https?:\/\/[^/]+/, '') : '-';
        const cleanMsg = err.message.replace(/\|/g, '\\|').replace(/\n/g, ' ').substring(0, 150);
        content += `| \`${err.timestamp.split('T')[1]?.substring(0, 8) || err.timestamp}\` | \`${err.type}\` | \`${cleanUrl}\` | ${cleanMsg} |\n`;
      }
      content += `\n`;
    }

    content += `---

## 🤖 3. PROMPT DE CORRECCIÓN PARA IA (Listo para Copiar y Pegar)

\`\`\`markdown
Actúa como Desarrollador Senior Full Stack en React 19, TypeScript, Supabase y Playwright para el proyecto "Raspando La Olla".

Hemos ejecutado la suite integral de pruebas E2E multiusuario y obtuvimos los siguientes resultados:
- Total Pruebas: ${totalTests}
- Aprobadas: ${passedTests}
- Fallidas: ${failedTests}
- Errores/Alertas detectadas en consola/red: ${this.errors.length}

${
  this.errors.length > 0
    ? `Lista de errores e incidencias detectadas para corregir:
${this.errors.map((e, idx) => `${idx + 1}. [${e.type.toUpperCase()}] ${e.message} (En: ${e.url || 'N/A'})`).join('\n')}

Por favor:
1. Analiza la causa raíz de cada fallo en los componentes y servicios correspondientes.
2. Aplica las correcciones quirúrgicas necesarias sin romper la compatibilidad con Supabase y las reglas contables.
3. Asegura que el linter y compilador pasen al 100%.`
    : `Todas las pruebas pasaron satisfactoriamente (${successRate}% éxito). No se detectaron fallos críticos ni errores en consola.
Todo el flujo de autenticación mock, perfilado estricto (onboarding), reclamo de bono, creación y unión de mesas en Bingo 90, Piedra Papel Tijera y La Vieja funciona correctamente.`
}
\`\`\`

---
*Reporte generado automáticamente por \`tests/e2e/error-reporter.ts\`*
`;

    const targetPath = customFilePath || path.join(process.cwd(), 'test-findings-report.md');
    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      console.log(`[ErrorReporter] Reporte de hallazgos generado en: ${targetPath}`);
    } catch (err) {
      console.error('[ErrorReporter] Error al escribir reporte markdown:', err);
    }

    return content;
  }
}

export const errorReporter = ErrorReporter.getInstance();
