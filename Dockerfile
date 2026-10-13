# Shaggar BPO Academy — PHP 8.3 + Apache
FROM php:8.3-apache

RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite headers \
 && sed -ri 's!/var/www/html!/var/www/html/frontend/public!g' /etc/apache2/sites-available/000-default.conf \
 && printf '<Directory /var/www/html/frontend/public>\n    AllowOverride All\n    Require all granted\n</Directory>\n' > /etc/apache2/conf-available/lms.conf \
 && a2enconf lms \
 && { \
      echo 'upload_max_filesize = 200M'; \
      echo 'post_max_size = 210M'; \
      echo 'memory_limit = 256M'; \
      echo 'max_execution_time = 120'; \
      echo 'expose_php = Off'; \
      echo 'date.timezone = Africa/Addis_Ababa'; \
    } > /usr/local/etc/php/conf.d/lms.ini

COPY . /var/www/html
RUN mkdir -p /var/www/html/backend/storage/uploads && chown -R www-data:www-data /var/www/html/backend/storage

EXPOSE 80
