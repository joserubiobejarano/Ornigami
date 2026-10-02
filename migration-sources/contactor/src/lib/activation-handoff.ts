import type { OnboardingLanguage, WebsitePlatform } from "@/lib/onboarding";

type HandoffLabels = {
  sectionTitle: string;
  sectionDescription: string;
  loginUrl: string;
  ownerEmail: string;
  temporaryPassword: string;
  hostedFormUrl: string;
  hostedFormHelper: string;
  iframeSnippet: string;
  iframeHelper: string;
  installInstructions: string;
  handoffText: string;
  copyFullHandoffText: string;
  nextSteps: string;
  whatsappStatusTitle: string;
  whatsappInProgressMessage: string;
  whatsappLiveMessage: string;
};

type HandoffContext = {
  language: OnboardingLanguage;
  platform: WebsitePlatform;
  loginUrl: string;
  ownerEmail: string;
  temporaryPasswordLabel: string;
  temporaryPasswordValue: string;
  hostedFormUrl: string;
  iframeSnippet: string;
  whatsappSenderApproved: boolean;
};

const HANDOFF_LABELS: Record<OnboardingLanguage, HandoffLabels> = {
  english: {
    sectionTitle: "Client handoff",
    sectionDescription: "Internal/admin-only package for sharing activation details with the client.",
    loginUrl: "Login URL",
    ownerEmail: "Owner email",
    temporaryPassword: "Temporary password",
    hostedFormUrl: "Hosted form URL",
    hostedFormHelper: "Share this hosted link so the client can start collecting leads immediately.",
    iframeSnippet: "Iframe embed snippet",
    iframeHelper: "Use this snippet with the website platform steps below.",
    installInstructions: "Website install instructions",
    handoffText: "Ready-to-send handoff text",
    copyFullHandoffText: "Copy full handoff text",
    nextSteps: "Next steps",
    whatsappStatusTitle: "WhatsApp status",
    whatsappInProgressMessage:
      "WhatsApp setup in progress. We will notify you once it is active.",
    whatsappLiveMessage: "Your assistant is now live on WhatsApp.",
  },
  spanish: {
    sectionTitle: "Entrega al cliente",
    sectionDescription: "Paquete interno/admin para compartir los detalles de activacion con el cliente.",
    loginUrl: "URL de acceso",
    ownerEmail: "Correo del propietario",
    temporaryPassword: "Contrasena temporal",
    hostedFormUrl: "URL del formulario alojado",
    hostedFormHelper: "Comparte este enlace para que el cliente empiece a recibir leads de inmediato.",
    iframeSnippet: "Snippet iframe",
    iframeHelper: "Usa este snippet con los pasos de instalacion de abajo.",
    installInstructions: "Instrucciones de instalacion",
    handoffText: "Texto de entrega listo para enviar",
    copyFullHandoffText: "Copiar texto completo",
    nextSteps: "Siguientes pasos",
    whatsappStatusTitle: "Estado de WhatsApp",
    whatsappInProgressMessage:
      "La configuracion de WhatsApp esta en progreso. Te avisaremos cuando este activa.",
    whatsappLiveMessage: "Tu asistente ya esta activo en WhatsApp.",
  },
};

const INSTALL_INSTRUCTIONS: Record<
  OnboardingLanguage,
  Record<WebsitePlatform, string[]>
> = {
  english: {
    wordpress: ["Open the page editor.", "Add a Custom HTML block.", "Paste the iframe snippet."],
    webflow: ["Open the page in Designer.", "Add an Embed element.", "Paste the iframe snippet."],
    framer: ["Open the target page.", "Add an Embed component.", "Paste the iframe snippet."],
    squarespace: ["Open the page editor.", "Add a Code block.", "Paste the iframe snippet."],
    shopify: [
      "Open the page or template in theme editor.",
      "Add a Custom Liquid or HTML section/snippet.",
      "Paste the iframe snippet.",
    ],
    custom_code: [
      "Open the file or page where you want the form.",
      "Paste the iframe snippet where the form should appear.",
      "Save and publish your changes.",
    ],
    other: [
      "Use the hosted form URL or the embed snippet based on your site builder.",
      "If your builder supports embeds, paste the iframe snippet.",
      "If not, share the hosted form URL.",
    ],
  },
  spanish: {
    wordpress: [
      "Abre el editor de la pagina.",
      "Agrega un bloque de HTML personalizado.",
      "Pega el snippet iframe.",
    ],
    webflow: [
      "Abre la pagina en Designer.",
      "Agrega un elemento Embed.",
      "Pega el snippet iframe.",
    ],
    framer: [
      "Abre la pagina donde ira el formulario.",
      "Agrega un componente Embed.",
      "Pega el snippet iframe.",
    ],
    squarespace: [
      "Abre el editor de la pagina.",
      "Agrega un bloque de codigo.",
      "Pega el snippet iframe.",
    ],
    shopify: [
      "Abre la pagina o plantilla en el editor del tema.",
      "Agrega una seccion/snippet Custom Liquid o HTML.",
      "Pega el snippet iframe.",
    ],
    custom_code: [
      "Abre el archivo o pagina donde quieres el formulario.",
      "Pega el snippet iframe donde debe mostrarse.",
      "Guarda y publica los cambios.",
    ],
    other: [
      "Usa la URL del formulario alojado o el snippet segun tu constructor web.",
      "Si tu plataforma acepta embeds, pega el iframe.",
      "Si no, comparte la URL del formulario alojado.",
    ],
  },
};

export function getHandoffLabels(language: OnboardingLanguage): HandoffLabels {
  return HANDOFF_LABELS[language];
}

export function getInstallInstructions(
  language: OnboardingLanguage,
  platform: WebsitePlatform,
): string[] {
  return INSTALL_INSTRUCTIONS[language][platform];
}

export function buildClientHandoffText(context: HandoffContext): string {
  const labels = getHandoffLabels(context.language);
  const installInstructions = getInstallInstructions(context.language, context.platform);
  const whatsappStatusMessage = context.whatsappSenderApproved
    ? labels.whatsappLiveMessage
    : labels.whatsappInProgressMessage;

  if (context.language === "spanish") {
    return [
      "Tu asistente de leads esta listo para pruebas.",
      "",
      `${labels.loginUrl}:`,
      context.loginUrl,
      `${labels.ownerEmail}:`,
      context.ownerEmail,
      `${context.temporaryPasswordLabel}:`,
      context.temporaryPasswordValue,
      "",
      `${labels.whatsappStatusTitle}:`,
      whatsappStatusMessage,
      "",
      `${labels.hostedFormUrl}:`,
      context.hostedFormUrl,
      "",
      `${labels.iframeSnippet}:`,
      context.iframeSnippet,
      "",
      `${labels.installInstructions}:`,
      ...installInstructions.map((step, index) => `${index + 1}. ${step}`),
      "",
      `${labels.nextSteps}:`,
      "1. Inicia sesion y revisa tu panel",
      "2. Instala y prueba el formulario",
      "3. Envia algunos leads de prueba",
      "4. Confirma que llegan las notificaciones",
    ].join("\n");
  }

  return [
    "Your lead assistant is ready for testing.",
    "",
    `${labels.loginUrl}:`,
    context.loginUrl,
    `${labels.ownerEmail}:`,
    context.ownerEmail,
    `${context.temporaryPasswordLabel}:`,
    context.temporaryPasswordValue,
    "",
    `${labels.whatsappStatusTitle}:`,
    whatsappStatusMessage,
    "",
    `${labels.hostedFormUrl}:`,
    context.hostedFormUrl,
    "",
    `${labels.iframeSnippet}:`,
    context.iframeSnippet,
    "",
    `${labels.installInstructions}:`,
    ...installInstructions.map((step, index) => `${index + 1}. ${step}`),
    "",
    `${labels.nextSteps}:`,
    "1. Log in and review your dashboard",
    "2. Install and test the form",
    "3. Send a few test leads",
    "4. Confirm notifications are arriving",
  ].join("\n");
}
