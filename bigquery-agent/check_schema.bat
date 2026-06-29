@echo off
chcp 65001 >nul
set PATH=%PATH%;C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin
bq show --schema --format=prettyjson secure_dataset.user_coupon
