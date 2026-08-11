@echo off
REM Runs the training chain detached from any interactive shell.
REM
REM Background jobs launched from the agent shell were being terminated part-way
REM through every long run, while an identical shorter run finished. Nothing in the
REM Windows logs explained it - no power transition, no crash, no resource
REM exhaustion - which leaves termination by the parent process tree. Launching this
REM through the Task Scheduler puts training under the scheduler service instead, so
REM it outlives whatever stops the shell's children.
REM
REM Register and start it with:
REM   schtasks /Create /TN BotzinTraining /TR "C:\projetos\botzin\scripts\run-trainings.cmd" /SC ONCE /ST 00:00 /F
REM   schtasks /Run /TN BotzinTraining

cd /d C:\projetos\botzin
set LOG=storage\training-chain.log

echo [chain] started %DATE% %TIME% > %LOG%

echo [chain] classifier resume >> %LOG%
python scripts\train-creature-classifier.py --resume >> %LOG% 2>&1
echo [chain] classifier resume exit=%ERRORLEVEL% >> %LOG%

echo [chain] classifier freeze 0 >> %LOG%
python scripts\train-creature-classifier.py --reuse-dataset --freeze 0 --run-name species-freeze0 ^
  --output-model models\tibia-creature-classifier-freeze0.onnx ^
  --output-labels models\tibia-creature-classifier-freeze0.labels.json >> %LOG% 2>&1
echo [chain] classifier freeze0 exit=%ERRORLEVEL% >> %LOG%

echo [chain] finished %DATE% %TIME% >> %LOG%
