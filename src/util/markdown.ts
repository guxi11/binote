export const fileNoteTemplate = (projectPath: string): string =>
  `# ${projectPath}

## Summary

## Notes

## Links
`;

export const dirNoteTemplate = (dirPath: string): string =>
  `# ${dirPath}/

## Overview

## Structure

## Notes

## Links
`;

export const standaloneNoteTemplate = (title: string): string =>
  `# ${title}

## Notes

## Links
`;
