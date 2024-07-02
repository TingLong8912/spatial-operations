import { Router } from 'express';
const router = Router();
const { exec } = require('child_process');

router.get('/', (req, res) => {
  exec('python -m venv venv', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error creating virtual environment: ${error}`);
      res.status(500).send('Internal Server Error');
      return;
    } else {
      console.log("success");
    }

    // exec('python import os&print(os.getcwd())', (error, stdout, stderr) => {
    exec('venv/Scripts/pip install owlready2', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error installing owlready2: ${error}`);
        res.status(500).send('Internal Server Error');
        return;
      }
      console.log(`owlready2 installed: ${stdout}`);

      exec('venv/Scripts/python ./routes/your_script.py', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing your_script.py: ${error}`);
          res.status(500).send('Internal Server Error');
          return;
        }
        res.status(200).json(stdout);
      });
    });
  });
});

export default router;
