@echo off
cd /d "d:\desktop\Outreach"
title Outreach & Automation Suite

:: Start the Master Dashboard, IMAP Harvester & WhatsApp Delivery
node --env-file=.env dashboard.js
