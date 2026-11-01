-- Bandeja de soporte de Windoce. Idempotente: corre en cada publicación.
CREATE TABLE IF NOT EXISTS conversaciones (
  id TEXT PRIMARY KEY,                 -- id del hilo de Gmail, o form-<uuid> si vino de un formulario
  app TEXT NOT NULL,
  cliente_email TEXT NOT NULL,
  cliente_nombre TEXT,
  asunto TEXT NOT NULL,
  idioma TEXT,
  tipo TEXT NOT NULL,                  -- pregunta, tecnico, pago, queja, borrar_cuenta, idea, comercial, otro
  prioridad TEXT NOT NULL DEFAULT 'normal',
  estado TEXT NOT NULL DEFAULT 'nuevo',
  estado_manual INTEGER NOT NULL DEFAULT 0,
  plantilla TEXT,
  respuesta_auto INTEGER NOT NULL DEFAULT 0,
  sesion_avisada TEXT,
  origen TEXT NOT NULL DEFAULT 'correo',
  nota TEXT,
  primer_mensaje TEXT,
  primera_respuesta TEXT,
  ultimo_cliente TEXT,
  ultima_respuesta TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_estado ON conversaciones (estado, ultimo_cliente);
CREATE INDEX IF NOT EXISTS idx_conv_cliente ON conversaciones (cliente_email);

CREATE TABLE IF NOT EXISTS mensajes (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL,
  de TEXT NOT NULL,                    -- cliente o soporte
  fecha TEXT NOT NULL,
  texto TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msj_conv ON mensajes (conversacion_id, fecha);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id TEXT NOT NULL,
  momento TEXT NOT NULL,
  quien TEXT NOT NULL,
  que TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  creada TEXT NOT NULL,
  vence TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intentos (
  clave TEXT NOT NULL,
  momento TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intentos ON intentos (clave, momento);

CREATE TABLE IF NOT EXISTS ajustes (
  nombre TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
