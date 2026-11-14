@echo off
setlocal
cd /d "%~dp0"
py -3 -m unittest discover -s tests -v
py -3 manage.py validate bank.json
pause
