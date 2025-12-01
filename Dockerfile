# Usa la imagen oficial de Nginx más ligera (Alpine)
FROM nginx:stable-alpine

# Instalar 'gettext' (envsubst) para reemplazar la variable $PORT.
# Es crucial para que Nginx escuche en el puerto asignado por Railway.
RUN apk add --no-cache gettext

# Copiar la configuración de Nginx (como plantilla) y los archivos estáticos
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY . /usr/share/nginx/html

# 🔑 CLAVE: Usar envsubst para sustituir $PORT en la plantilla
# y luego iniciar Nginx.
CMD sh -c "envsubst '\$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"

# El puerto 80 es solo informativo para Docker,
# Railway respeta el puerto que se abre en el 'listen' de Nginx (que ahora es $PORT)
EXPOSE 80