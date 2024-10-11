# MuseIQ - Python Backend Service

MuseIQ is a server-side application designed to handle interactions and image processing for a museum guide app. This backend is built using Django and provides a REST API for storing, processing, and retrieving information about user interactions with various exhibits, including text descriptions and image data.

## Features

* **User Interaction Management**: Stores and retrieves user interactions, including descriptions, dates, and associated images.
* **Base64 Image Handling**: Processes base64-encoded images and converts them into file objects for storage.
* **Data Synchronization**: Supports data synchronization between the server and iOS clients, ensuring that user interactions are always up-to-date.
* **Error Logging**: Logs request data and validation errors to help debug issues efficiently.

## Prerequisites

Before setting up the server, make sure you have the following installed:

* Python 3.11 or higher
* Django 5.1.2
* Virtual environment tools (`venv` or `virtualenv`)
* Any other dependencies listed in `requirements.txt`

## Getting Started

### Installation

1. **Clone the repository**:

```bash
git clone https://github.com/quake0day/museum_project.git
cd museum_project
```

2. **Create and activate a virtual environment**:

```bash
python3 -m venv venv
source venv/bin/activate # On Windows, use venv\Scripts\activate
```

3. **Install dependencies**:

```bash
pip install -r requirements.txt
```

### Database Setup

1. **Apply database migrations**:

```bash
python manage.py makemigrations
python manage.py migrate
```

2. **Create a superuser to access the Django admin interface**:

```bash
python manage.py createsuperuser
```

### Running the Server

Start the Django development server:

```bash
python manage.py runserver
```

The server should now be running at `http://127.0.0.1:8000/` or the configured host.

## API Endpoints

1. `/api/interactions/list/` (POST)
   * **Description**: This endpoint accepts interaction data, including a base64-encoded image, user response, date, and a unique ID.
   * **Data Format**: The image should be base64-encoded with the prefix `data:image/jpeg;base64,`.
   * **Response**: Returns a success message if the data is saved successfully or error details if the data validation fails.

2. `/api/interactions/view/` (GET)
   * **Description**: This endpoint retrieves a list of user interactions, ordered by the date of the interaction.
   * **Response**: Returns a JSON list of interactions, including the image file paths, response details, and interaction dates.

## Error Handling

* **400 Bad Request**: Returned if the request contains invalid data or required fields are missing.
* **500 Internal Server Error**: Returned if there is a server-side error during the request processing.

## Logging

The server logs all incoming request data and error details to help with debugging. Check the console output for detailed error messages and tracebacks.

## Troubleshooting

* **CSRF Issues**: For POST requests, ensure that the `@csrf_exempt` decorator is applied to avoid CSRF validation errors.
* **Database Migration Errors**: If you encounter migration issues, check the model definitions and ensure that the migrations are properly created and applied.

## Contributing

Feel free to open issues and submit pull requests if you find any bugs or have suggestions for new features.

## License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

## Contact

For any questions or issues, please contact the development team at [quake0day@gmail.com].
