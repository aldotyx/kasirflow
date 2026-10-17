#!/bin/bash
# KasirFlow GitHub Push Helper
# Usage: ./push-to-github.sh <YOUR_GITHUB_PERSONAL_ACCESS_TOKEN>

TOKEN="$1"

if [ -z "$TOKEN" ]; then
  echo "Error: Personal Access Token GitHub belum dimasukkan."
  echo "Cara penggunaan: bash push-to-github.sh <GITHUB_PERSONAL_ACCESS_TOKEN>"
  echo ""
  echo "Contoh: bash push-to-github.sh ghp_xxxxxx"
  exit 1
fi

echo "Mengatur remote origin dengan token..."
git remote set-url origin "https://${TOKEN}@github.com/aldotyx/kasirflow.git"

echo "Melakukan push ke branch main di aldotyx/kasirflow..."
git push -u origin main --force

if [ $? -eq 0 ]; then
  echo "Push ke GitHub berhasil!"
  # Bersihkan token dari URL remote agar tidak tertinggal di konfigurasi lokal
  git remote set-url origin "https://github.com/aldotyx/kasirflow.git"
else
  echo "Push gagal. Pastikan token Anda memiliki hak akses (scope: repo)."
fi
