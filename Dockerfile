# Usa la imagen oficial de Nginx más ligera (Alpine)
FROM nginx:stable-alpine

# Elimina la configuración por defecto de Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Copia los archivos estáticos de tu proyecto al directorio de servicio de Nginx
COPY . /usr/share/nginx/html

# Puerto por defecto de Nginx
EXPOSE 80