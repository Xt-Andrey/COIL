(function () {
  'use strict';
 
  /* ---------- 1. Configuración y datos ---------- */
 
  const CLAVES = {
    usuarios: 'aeroandes_usuarios',
    sesion: 'aeroandes_sesion',
    reservas: 'aeroandes_reservas',
    emailRecordado: 'aeroandes_email_recordado'
  };
 
  // Vuelos de ejemplo (los dos primeros son los que ya tenía el HTML).
  // Para agregar más vuelos, basta con añadir un objeto a esta lista.
  const VUELOS = [
    { codigo: 'AE-101', origen: 'Bogota',   destino: 'Medellin',  salida: '08:00 a.m', precio: 250000 },
    { codigo: 'AE-202', origen: 'Bogota',   destino: 'Cali',      salida: '10:30 p.m', precio: 270000 },
    { codigo: 'AE-303', origen: 'Medellin', destino: 'Bogota',    salida: '06:15 a.m', precio: 240000 },
    { codigo: 'AE-404', origen: 'Cali',     destino: 'Bogota',    salida: '02:00 p.m', precio: 265000 },
    { codigo: 'AE-505', origen: 'Bogota',   destino: 'Cartagena', salida: '07:45 a.m', precio: 310000 },
    { codigo: 'AE-606', origen: 'Medellin', destino: 'Cali',      salida: '11:20 a.m', precio: 220000 }
  ];
 
  const PAGINA_LOGIN = 'login.html';
  const PAGINA_INICIO = 'Aerolinea.html';
 
 
  /* ---------- 2. Utilidades generales ---------- */
 
  // Lectura/escritura segura en el almacenamiento del navegador
  function leer(almacen, clave, porDefecto) {
    try {
      const texto = almacen.getItem(clave);
      return texto ? JSON.parse(texto) : porDefecto;
    } catch (e) {
      return porDefecto;
    }
  }
 
  function guardar(almacen, clave, valor) {
    try {
      almacen.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      mostrarAviso('No se pudo guardar la información en este navegador.', 'error');
      return false;
    }
  }
 
  // Quita tildes y pasa a minúsculas: "Bogotá" y "bogota" se comparan igual
  function normalizar(texto) {
    return String(texto)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }
 
  function formatearPrecio(valor) {
    return '$' + Number(valor).toLocaleString('es-CO');
  }
 
  // "2026-11-20" -> "20 de noviembre de 2026" (sin problemas de zona horaria)
  function formatearFecha(iso) {
    const [anio, mes, dia] = iso.split('-').map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString('es-CO', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }
 
  function hoyISO() {
    const h = new Date();
    const mm = String(h.getMonth() + 1).padStart(2, '0');
    const dd = String(h.getDate()).padStart(2, '0');
    return h.getFullYear() + '-' + mm + '-' + dd;
  }
 
  // Evita que un nombre con símbolos como < o > rompa el HTML
  function escaparHTML(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }
 
  // Cifra la contraseña con SHA-256 (si el navegador lo permite)
  async function cifrar(texto) {
    if (window.crypto && window.crypto.subtle) {
      const datos = new TextEncoder().encode(texto);
      const hash = await window.crypto.subtle.digest('SHA-256', datos);
      return Array.from(new Uint8Array(hash))
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    }
    return btoa(unescape(encodeURIComponent(texto))); // alternativa básica
  }
 
 
  /* ---------- 3. Avisos (toast) y mensajes de error ---------- */
 
  function mostrarAviso(mensaje, tipo) {
    let contenedor = document.getElementById('avisos');
    if (!contenedor) {
      contenedor = document.createElement('div');
      contenedor.id = 'avisos';
      contenedor.className = 'avisos';
      contenedor.setAttribute('aria-live', 'polite');
      document.body.appendChild(contenedor);
    }
    const aviso = document.createElement('div');
    aviso.className = 'aviso aviso-' + (tipo || 'info');
    aviso.textContent = mensaje;
    contenedor.appendChild(aviso);
    setTimeout(function () {
      aviso.classList.add('aviso-saliendo');
      setTimeout(function () { aviso.remove(); }, 300);
    }, 3500);
  }
 
  function marcarError(campo, mensaje) {
    campo.classList.add('invalido');
    campo.setAttribute('aria-invalid', 'true');
    let msg = campo.parentElement.querySelector('.mensaje-error');
    if (!msg) {
      msg = document.createElement('small');
      msg.className = 'mensaje-error';
      campo.parentElement.appendChild(msg);
    }
    msg.textContent = mensaje;
  }
 
  function limpiarError(campo) {
    campo.classList.remove('invalido');
    campo.removeAttribute('aria-invalid');
    const msg = campo.parentElement.querySelector('.mensaje-error');
    if (msg) msg.remove();
  }
 
  // Prepara un formulario: validación propia (en vez de la del navegador)
  // y borra el error de cada campo apenas el usuario vuelve a escribir.
  function prepararFormulario(form) {
    form.noValidate = true;
    form.querySelectorAll('input, select').forEach(function (campo) {
      campo.addEventListener('input', function () { limpiarError(campo); });
      campo.addEventListener('change', function () { limpiarError(campo); });
    });
  }
 
  // Revisa una lista de reglas [campo, condiciónDeError, mensaje].
  // Muestra el primer error de cada campo y enfoca el primero que falle.
  function validar(reglas) {
    let primero = null;
    const yaMarcados = new Set();
    reglas.forEach(function (regla) {
      const campo = regla[0], hayError = regla[1], mensaje = regla[2];
      if (hayError && !yaMarcados.has(campo)) {
        marcarError(campo, mensaje);
        yaMarcados.add(campo);
        if (!primero) primero = campo;
      }
    });
    if (primero) primero.focus();
    return !primero;
  }
 
 
 
  /* ---------- 3b. Estilos y campos que agrega el propio JS ----------
     Así no hace falta modificar styles.css ni los HTML. */
 
  const ESTILOS_JS = `
/* Errores de validación en los campos */
input.invalido, select.invalido { border-color: #c62828; background: #fff6f6; }
.mensaje-error { color: #c62828; font-size: 0.85rem; }
 
/* Avisos emergentes */
.avisos { position: fixed; top: 16px; right: 16px; z-index: 2000; display: flex; flex-direction: column; gap: 8px; max-width: calc(100% - 32px); }
.aviso { padding: 12px 18px; border-left: 5px solid #0b5ea8; border-radius: 6px; background: #ffffff; color: #17324d; box-shadow: 0 4px 14px rgba(0,0,0,0.25); transition: opacity 0.3s, transform 0.3s; }
.aviso-exito { border-left-color: #2e7d32; }
.aviso-error { border-left-color: #c62828; }
.aviso-saliendo { opacity: 0; transform: translateX(20px); }
 
/* Menú con sesión */
.menu .saludo { padding: 8px 6px; color: #ffffff; }
 
/* Búsqueda y tabla */
.resumen-busqueda { margin: 0 0 12px; font-weight: bold; }
.boton-enlace { padding: 0; border: none; background: none; color: #0b5ea8; font-size: inherit; text-decoration: underline; cursor: pointer; }
.sin-resultados { text-align: center; color: #5b7a96; }
.boton-cancelar { padding: 8px 16px; border: none; border-radius: 6px; background: #c62828; color: #ffffff; font-weight: bold; cursor: pointer; }
.boton-cancelar:hover { background: #8e1c1c; }
 
/* Ventana de confirmación */
.modal-fondo { position: fixed; inset: 0; z-index: 1500; display: flex; justify-content: center; align-items: center; padding: 16px; background: rgba(10,42,74,0.6); }
.modal { width: 100%; max-width: 420px; padding: 24px; border-radius: 12px; background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
.modal h3 { margin-top: 0; color: #0a2a4a; }
.detalle-reserva { padding: 0; list-style: none; }
.modal-botones { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
.modal .boton-atras { padding: 12px 20px; border: 1px solid #b8d4ea; border-radius: 6px; background: #ffffff; color: #0a2a4a; font-size: 1rem; cursor: pointer; }
`;
 
  function inyectarEstilos() {
    const estilo = document.createElement('style');
    estilo.id = 'estilos-main-js';
    estilo.textContent = ESTILOS_JS;
    document.head.appendChild(estilo);
  }
 
  // Crea un campo (label + input) con el mismo formato que usan los HTML
  function crearCampo(id, tipo, etiqueta, placeholder) {
    const grupo = document.createElement('div');
    grupo.className = 'grupo-campo';
    grupo.innerHTML =
      '<label for="' + id + '">' + etiqueta + '</label>' +
      '<input type="' + tipo + '" id="' + id + '" name="' + id +
      '" placeholder="' + placeholder + '" required>';
    return grupo;
  }
 
  // El registro original no tiene contraseña: se agrega por JS
  function agregarCamposRegistro(form) {
    if (form.elements['password']) return;
    const fila = document.createElement('div');
    fila.className = 'fila-doble';
    fila.appendChild(crearCampo('password', 'password', 'Contraseña',
      'Minimo 8 caracteres, letras y numeros'));
    fila.appendChild(crearCampo('confirmar-password', 'password', 'Confirmar contraseña',
      'Repite la contraseña'));
    form.insertBefore(fila, form.querySelector('.fila-botones'));
  }
 
  // Recuperar original no pide correo: se agrega por JS
  function agregarCampoRecuperar(form) {
    if (form.elements['email']) return;
    form.insertBefore(
      crearCampo('email', 'email', 'Correo electronico', 'Correo electronico'),
      form.firstElementChild
    );
  }
 
 
  // Los avisos nativos del navegador salen en el idioma del navegador
  // (a veces en inglés). Se desactivan y se reemplazan por mensajes en español.
  function traducirValidacionNativa() {
    document.querySelectorAll('form').forEach(function (f) { f.noValidate = true; });
 
    document.addEventListener('invalid', function (e) {
      e.preventDefault(); // evita el globo en inglés
      const campo = e.target;
      const v = campo.validity;
      let mensaje = 'Revisa este campo.';
      if (v.valueMissing) mensaje = 'Este campo es obligatorio.';
      else if (v.typeMismatch && campo.type === 'email') mensaje = 'Escribe un correo válido.';
      else if (v.rangeUnderflow) mensaje = 'La fecha no puede ser anterior a hoy.';
      else if (v.patternMismatch) mensaje = 'El formato no es válido.';
      marcarError(campo, mensaje);
    }, true);
  }
 
  /* ---------- 4. Validadores ---------- */
 
  const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const REGEX_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]*$/;
  const REGEX_CELULAR = /^3\d{9}$/; // celular colombiano: 10 dígitos, empieza en 3
 
  function emailValido(v) { return REGEX_EMAIL.test(v.trim()); }
  function nombreValido(v) { return v.trim().length >= 2 && REGEX_NOMBRE.test(v.trim()); }
  function celularValido(v) { return REGEX_CELULAR.test(v.replace(/[\s-]/g, '')); }
  function passwordValida(v) { return v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v); }
 
  const MSG_PASSWORD = 'Debe tener mínimo 8 caracteres, con letras y números.';
 
 
  /* ---------- 5. Usuarios y sesión ---------- */
 
  function obtenerUsuarios() { return leer(localStorage, CLAVES.usuarios, []); }
 
  function buscarUsuario(email) {
    const buscado = email.trim().toLowerCase();
    return obtenerUsuarios().find(function (u) { return u.email === buscado; });
  }
 
  function obtenerSesion() {
    return leer(sessionStorage, CLAVES.sesion, null) || leer(localStorage, CLAVES.sesion, null);
  }
 
  function iniciarSesion(usuario, recordar) {
    const datos = { email: usuario.email, nombre: usuario.nombre };
    sessionStorage.removeItem(CLAVES.sesion);
    localStorage.removeItem(CLAVES.sesion);
    // "Recordarme": la sesión sobrevive aunque se cierre el navegador
    guardar(recordar ? localStorage : sessionStorage, CLAVES.sesion, datos);
  }
 
  function cerrarSesion() {
    sessionStorage.removeItem(CLAVES.sesion);
    localStorage.removeItem(CLAVES.sesion);
  }
 
 
  /* ---------- 6. Página: Registro ---------- */
 
  function iniciarRegistro() {
    const form = document.getElementById('form-registro');
    agregarCamposRegistro(form);
    prepararFormulario(form);
 
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const nombre = form.elements['nombre'];
      const apellidos = form.elements['apellidos'];
      const email = form.elements['email'];
      const celular = form.elements['celular'];
      const password = form.elements['password'];
      const confirmar = form.elements['confirmar-password'];
 
      const ok = validar([
        [nombre, !nombreValido(nombre.value), 'Escribe un nombre válido (solo letras).'],
        [apellidos, !nombreValido(apellidos.value), 'Escribe apellidos válidos (solo letras).'],
        [email, !emailValido(email.value), 'Escribe un correo válido, por ejemplo correo@gmail.com.'],
        [email, !!buscarUsuario(email.value), 'Ya existe una cuenta con este correo.'],
        [celular, !celularValido(celular.value), 'Celular de 10 dígitos que empiece por 3.'],
        [password, !passwordValida(password.value), MSG_PASSWORD],
        [confirmar, password.value !== confirmar.value, 'Las contraseñas no coinciden.']
      ]);
      if (!ok) return;
 
      const usuarios = obtenerUsuarios();
      usuarios.push({
        nombre: nombre.value.trim(),
        apellidos: apellidos.value.trim(),
        email: email.value.trim().toLowerCase(),
        celular: celular.value.replace(/[\s-]/g, ''),
        password: await cifrar(password.value)
      });
      if (!guardar(localStorage, CLAVES.usuarios, usuarios)) return;
 
      mostrarAviso('¡Cuenta creada! Ahora puedes iniciar sesión.', 'exito');
      setTimeout(function () { window.location.href = PAGINA_LOGIN; }, 1200);
    });
  }
 
 
  /* ---------- 7. Página: Inicio de sesión ---------- */
 
  function iniciarLogin() {
    // Si ya hay una sesión activa no tiene sentido ver el login
    if (obtenerSesion()) {
      window.location.replace(PAGINA_INICIO);
      return;
    }
 
    const form = document.getElementById('form-login');
    prepararFormulario(form);
    const email = form.elements['email'];
    const password = form.elements['password'];
    const recordarme = form.elements['recordarme'];
 
    // Rellena el correo si el usuario marcó "Recordarme" la vez anterior
    const recordado = leer(localStorage, CLAVES.emailRecordado, '');
    if (recordado) {
      email.value = recordado;
      recordarme.checked = true;
    }
 
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
 
      const ok = validar([
        [email, !emailValido(email.value), 'Escribe un correo válido.'],
        [password, password.value === '', 'Escribe tu contraseña.']
      ]);
      if (!ok) return;
 
      const usuario = buscarUsuario(email.value);
      const hash = await cifrar(password.value);
 
      // Mensaje genérico a propósito: no revela si el correo existe
      if (!usuario || usuario.password !== hash) {
        marcarError(password, 'Correo o contraseña incorrectos.');
        password.focus();
        return;
      }
 
      if (recordarme.checked) {
        guardar(localStorage, CLAVES.emailRecordado, usuario.email);
      } else {
        localStorage.removeItem(CLAVES.emailRecordado);
      }
 
      iniciarSesion(usuario, recordarme.checked);
      mostrarAviso('Bienvenido, ' + usuario.nombre + '.', 'exito');
      setTimeout(function () { window.location.href = PAGINA_INICIO; }, 700);
    });
  }
 
 
  /* ---------- 8. Página: Recuperar contraseña ---------- */
 
  function iniciarRecuperar() {
    const form = document.getElementById('form-recuperar');
    agregarCampoRecuperar(form);
    prepararFormulario(form);
 
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = form.elements['email'];
      const password = form.elements['password'];
      const confirmar = form.elements['confirmar-password'];
 
      const ok = validar([
        [email, !emailValido(email.value), 'Escribe el correo de tu cuenta.'],
        [email, !buscarUsuario(email.value), 'No encontramos una cuenta con este correo.'],
        [password, !passwordValida(password.value), MSG_PASSWORD],
        [confirmar, password.value !== confirmar.value, 'Las contraseñas no coinciden.']
      ]);
      if (!ok) return;
 
      const usuarios = obtenerUsuarios();
      const correo = email.value.trim().toLowerCase();
      const usuario = usuarios.find(function (u) { return u.email === correo; });
      usuario.password = await cifrar(password.value);
      if (!guardar(localStorage, CLAVES.usuarios, usuarios)) return;
 
      mostrarAviso('Contraseña actualizada. Inicia sesión con la nueva.', 'exito');
      setTimeout(function () { window.location.href = PAGINA_LOGIN; }, 1200);
    });
  }
 
 
  /* ---------- 9. Página principal: menú y sesión ---------- */
 
  // Cambia "Iniciar sesion" por saludo + "Cerrar sesion" si hay sesión
  function actualizarMenu() {
    const menu = document.querySelector('.menu');
    if (!menu) return;
    const enlace = menu.querySelector('a:last-child');
    const sesion = obtenerSesion();
    if (!enlace || !sesion) return;
 
    const saludo = document.createElement('span');
    saludo.className = 'saludo';
    saludo.textContent = 'Hola, ' + sesion.nombre.split(' ')[0];
    menu.insertBefore(saludo, enlace);
 
    enlace.textContent = 'Cerrar sesion';
    enlace.setAttribute('href', '#');
    enlace.addEventListener('click', function (e) {
      e.preventDefault();
      cerrarSesion();
      mostrarAviso('Sesión cerrada.', 'info');
      setTimeout(function () { window.location.reload(); }, 600);
    });
  }
 
  // Desplazamiento suave al pulsar los enlaces del menú (#vuelos, etc.)
  function activarDesplazamientoSuave() {
    document.documentElement.style.scrollBehavior = 'smooth';
  }
 
 
  /* ---------- 10. Página principal: buscador y tabla de vuelos ---------- */
 
  const estado = { vuelosMostrados: VUELOS };
 
  function dibujarVuelos(lista) {
    const cuerpo = document.querySelector('.tabla-vuelos tbody');
    if (!cuerpo) return;
    estado.vuelosMostrados = lista;
 
    if (lista.length === 0) {
      cuerpo.innerHTML =
        '<tr><td colspan="6" class="sin-resultados">' +
        'No hay vuelos para esa ruta. Prueba con otra ciudad.</td></tr>';
      return;
    }
 
    cuerpo.innerHTML = lista.map(function (v) {
      return '<tr>' +
        '<td>' + v.codigo + '</td>' +
        '<td>' + v.origen + '</td>' +
        '<td>' + v.destino + '</td>' +
        '<td>' + v.salida + '</td>' +
        '<td>' + formatearPrecio(v.precio) + '</td>' +
        '<td><button type="button" class="boton-reservar" data-codigo="' + v.codigo + '">Reservar</button></td>' +
        '</tr>';
    }).join('');
  }
 
  // Lista de ciudades para autocompletar origen y destino
  function activarAutocompletado(form) {
    const ciudades = Array.from(new Set(
      VUELOS.flatMap(function (v) { return [v.origen, v.destino]; })
    )).sort();
 
    const datalist = document.createElement('datalist');
    datalist.id = 'lista-ciudades';
    datalist.innerHTML = ciudades.map(function (c) {
      return '<option value="' + c + '"></option>';
    }).join('');
    document.body.appendChild(datalist);
 
    form.elements['origen'].setAttribute('list', 'lista-ciudades');
    form.elements['destino'].setAttribute('list', 'lista-ciudades');
  }
 
  // Mensaje que resume el resultado de la búsqueda
  function mostrarResumen(texto) {
    const tabla = document.querySelector('.tabla-vuelos');
    let resumen = document.getElementById('resumen-busqueda');
    if (!texto) {
      if (resumen) resumen.remove();
      return;
    }
    if (!resumen) {
      resumen = document.createElement('p');
      resumen.id = 'resumen-busqueda';
      resumen.className = 'resumen-busqueda';
      tabla.parentElement.insertBefore(resumen, tabla);
    }
    resumen.innerHTML = escaparHTML(texto) +
      ' <button type="button" class="boton-enlace" id="ver-todos">Ver todos los vuelos</button>';
    document.getElementById('ver-todos').addEventListener('click', function () {
      dibujarVuelos(VUELOS);
      mostrarResumen('');
    });
  }
 
  function iniciarBuscador() {
    const form = document.getElementById('form-busqueda');
    prepararFormulario(form);
    activarAutocompletado(form);
 
    const origen = form.elements['origen'];
    const destino = form.elements['destino'];
    const fecha = form.elements['fecha-ida'];
    const pasajeros = form.elements['pasajeros'];
 
    // No se pueden elegir fechas pasadas
    fecha.min = hoyISO();
 
    dibujarVuelos(VUELOS);
 
    form.addEventListener('submit', function (e) {
      e.preventDefault();
 
      const ok = validar([
        [origen, origen.value.trim() === '', 'Escribe la ciudad de origen.'],
        [destino, destino.value.trim() === '', 'Escribe la ciudad de destino.'],
        [destino, normalizar(origen.value) === normalizar(destino.value),
          'El destino debe ser distinto del origen.'],
        [fecha, fecha.value === '', 'Elige la fecha de ida.'],
        [fecha, fecha.value !== '' && fecha.value < hoyISO(),
          'La fecha no puede ser anterior a hoy.']
      ]);
      if (!ok) return;
 
      const o = normalizar(origen.value);
      const d = normalizar(destino.value);
      const resultado = VUELOS.filter(function (v) {
        return normalizar(v.origen).includes(o) && normalizar(v.destino).includes(d);
      });
 
      dibujarVuelos(resultado);
      const n = Number(pasajeros.value);
      mostrarResumen(
        resultado.length + (resultado.length === 1 ? ' vuelo encontrado' : ' vuelos encontrados') +
        ' de ' + origen.value.trim() + ' a ' + destino.value.trim() +
        ' el ' + formatearFecha(fecha.value) +
        ' para ' + n + (n === 1 ? ' pasajero.' : ' pasajeros.')
      );
      document.getElementById('vuelos').scrollIntoView();
    });
 
    // Un solo "escuchador" para todos los botones Reservar de la tabla
    document.querySelector('.tabla-vuelos tbody').addEventListener('click', function (e) {
      const boton = e.target.closest('.boton-reservar');
      if (!boton) return;
      const vuelo = VUELOS.find(function (v) { return v.codigo === boton.dataset.codigo; });
      iniciarReserva(vuelo, form);
    });
  }
 
 
  /* ---------- 11. Reservas ---------- */
 
  function obtenerReservas() {
    const sesion = obtenerSesion();
    if (!sesion) return [];
    return leer(localStorage, CLAVES.reservas, []).filter(function (r) {
      return r.email === sesion.email;
    });
  }
 
  function iniciarReserva(vuelo, form) {
    const sesion = obtenerSesion();
    if (!sesion) {
      mostrarAviso('Inicia sesión para reservar tu vuelo.', 'error');
      setTimeout(function () { window.location.href = PAGINA_LOGIN; }, 1200);
      return;
    }
 
    const fecha = form.elements['fecha-ida'];
    if (fecha.value === '' || fecha.value < hoyISO()) {
      marcarError(fecha, 'Elige una fecha de ida válida para reservar.');
      document.getElementById('inicio').scrollIntoView();
      fecha.focus();
      return;
    }
 
    const n = Number(form.elements['pasajeros'].value);
    const total = vuelo.precio * n;
 
    abrirModal({
      titulo: 'Confirmar reserva',
      html:
        '<ul class="detalle-reserva">' +
        '<li><strong>Vuelo:</strong> ' + vuelo.codigo + '</li>' +
        '<li><strong>Ruta:</strong> ' + vuelo.origen + ' → ' + vuelo.destino + '</li>' +
        '<li><strong>Fecha:</strong> ' + formatearFecha(fecha.value) + '</li>' +
        '<li><strong>Salida:</strong> ' + vuelo.salida + '</li>' +
        '<li><strong>Pasajeros:</strong> ' + n + '</li>' +
        '<li><strong>Total:</strong> ' + formatearPrecio(total) + '</li>' +
        '</ul>',
      textoConfirmar: 'Confirmar',
      alConfirmar: function () {
        const todas = leer(localStorage, CLAVES.reservas, []);
        const reserva = {
          id: 'AA' + Date.now().toString(36).toUpperCase(),
          email: sesion.email,
          codigo: vuelo.codigo,
          origen: vuelo.origen,
          destino: vuelo.destino,
          salida: vuelo.salida,
          fecha: fecha.value,
          pasajeros: n,
          total: total
        };
        todas.push(reserva);
        if (guardar(localStorage, CLAVES.reservas, todas)) {
          mostrarAviso('¡Reserva ' + reserva.id + ' confirmada!', 'exito');
          dibujarMisReservas();
        }
      }
    });
  }
 
  // Sección "Mis reservas": solo existe si hay sesión y reservas
  function dibujarMisReservas() {
    let seccion = document.getElementById('mis-reservas');
    const reservas = obtenerReservas();
 
    if (reservas.length === 0) {
      if (seccion) seccion.remove();
      return;
    }
 
    if (!seccion) {
      seccion = document.createElement('section');
      seccion.id = 'mis-reservas';
      seccion.className = 'seccion';
      const servicios = document.getElementById('servicios');
      servicios.parentElement.insertBefore(seccion, servicios);
    }
 
    seccion.innerHTML =
      '<h2>Mis reservas</h2>' +
      '<table class="tabla-vuelos"><thead><tr>' +
      '<th>Reserva</th><th>Vuelo</th><th>Ruta</th><th>Fecha</th><th>Pasajeros</th><th>Total</th><th>Accion</th>' +
      '</tr></thead><tbody>' +
      reservas.map(function (r) {
        return '<tr>' +
          '<td>' + r.id + '</td>' +
          '<td>' + r.codigo + '</td>' +
          '<td>' + r.origen + ' → ' + r.destino + '</td>' +
          '<td>' + formatearFecha(r.fecha) + '</td>' +
          '<td>' + r.pasajeros + '</td>' +
          '<td>' + formatearPrecio(r.total) + '</td>' +
          '<td><button type="button" class="boton-cancelar" data-id="' + r.id + '">Cancelar</button></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
 
    seccion.querySelectorAll('.boton-cancelar').forEach(function (boton) {
      boton.addEventListener('click', function () {
        const id = boton.dataset.id;
        abrirModal({
          titulo: 'Cancelar reserva',
          html: '<p>¿Seguro que quieres cancelar la reserva <strong>' + id + '</strong>?</p>',
          textoConfirmar: 'Sí, cancelar',
          alConfirmar: function () {
            const restantes = leer(localStorage, CLAVES.reservas, []).filter(function (r) {
              return r.id !== id;
            });
            guardar(localStorage, CLAVES.reservas, restantes);
            mostrarAviso('Reserva cancelada.', 'info');
            dibujarMisReservas();
          }
        });
      });
    });
  }
 
 
  /* ---------- 12. Ventana de confirmación (modal) ---------- */
 
  function abrirModal(opciones) {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">' +
      '<h3 id="modal-titulo">' + opciones.titulo + '</h3>' +
      '<div class="modal-cuerpo">' + opciones.html + '</div>' +
      '<div class="modal-botones">' +
      '<button type="button" class="boton-atras" data-accion="cancelar">Volver</button>' +
      '<button type="button" class="boton-principal" data-accion="confirmar">' + opciones.textoConfirmar + '</button>' +
      '</div></div>';
    document.body.appendChild(fondo);
 
    function cerrar() {
      document.removeEventListener('keydown', alPulsarTecla);
      fondo.remove();
    }
    function alPulsarTecla(e) { if (e.key === 'Escape') cerrar(); }
 
    fondo.addEventListener('click', function (e) {
      if (e.target === fondo) return cerrar(); // clic fuera de la ventana
      const accion = e.target.dataset.accion;
      if (accion === 'cancelar') cerrar();
      if (accion === 'confirmar') {
        cerrar();
        opciones.alConfirmar();
      }
    });
    document.addEventListener('keydown', alPulsarTecla);
    fondo.querySelector('[data-accion="confirmar"]').focus();
  }
 
 
  /* ---------- 13. Arranque: qué se activa en cada página ---------- */
 
  document.addEventListener('DOMContentLoaded', function () {
    inyectarEstilos();
    traducirValidacionNativa();
    if (document.getElementById('form-login')) iniciarLogin();
    if (document.getElementById('form-registro')) iniciarRegistro();
    if (document.getElementById('form-recuperar')) iniciarRecuperar();
 
    if (document.getElementById('form-busqueda')) {
      activarDesplazamientoSuave();
      actualizarMenu();
      iniciarBuscador();
      dibujarMisReservas();
    }
  });
 
})();