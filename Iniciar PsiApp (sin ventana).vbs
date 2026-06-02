' ============================================================
' Iniciar PsiApp (sin ventana de terminal)
' Doble clic para iniciar la app directamente en el navegador
' ============================================================

Dim fso, shell, scriptDir, batPath

Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Obtener la carpeta donde está este archivo
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath   = scriptDir & "\Iniciar PsiApp.bat"

' Verificar que el .bat existe
If Not fso.FileExists(batPath) Then
    MsgBox "No se encontró 'Iniciar PsiApp.bat' en la misma carpeta." & vbCrLf & _
           "Asegurate de que ambos archivos estén en la carpeta psi-app.", _
           vbCritical, "PsiApp - Error"
    WScript.Quit
End If

' Verificar que Node.js está instalado
Dim nodeCheck
nodeCheck = shell.Run("cmd /c where node >nul 2>&1", 0, True)
If nodeCheck <> 0 Then
    MsgBox "Node.js no está instalado." & vbCrLf & vbCrLf & _
           "Descargalo desde https://nodejs.org" & vbCrLf & _
           "y volvé a intentar.", _
           vbCritical, "PsiApp - Error"
    WScript.Quit
End If

' Iniciar el servidor en segundo plano (ventana oculta)
shell.CurrentDirectory = scriptDir
shell.Run "cmd /c """ & batPath & """ >nul 2>&1", 0, False

' Esperar que el servidor levante (3 segundos)
WScript.Sleep 3000

' Abrir el navegador
shell.Run "http://localhost:3000"

' Listo — el proceso Node sigue corriendo en segundo plano.
' Para cerrarlo: Administrador de tareas → buscar "node" → finalizar tarea.
