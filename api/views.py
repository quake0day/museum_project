from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import JSONParser
from rest_framework import status
from .models import Interaction
from .serializers import InteractionSerializer
import logging
from django.shortcuts import render

logger = logging.getLogger(__name__)

from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger

@csrf_exempt
def interaction_list(request):
    interactions_qs = Interaction.objects.all().order_by('-date')

    search_query = request.GET.get('q', '').strip()
    if search_query:
        interactions_qs = interactions_qs.filter(response__icontains=search_query)

    total_interactions = Interaction.objects.count()
    filtered_count = interactions_qs.count()
    spotlight_interactions = list(interactions_qs[:3])

    page = request.GET.get('page', 1)
    paginator = Paginator(interactions_qs, 8)

    try:
        interactions_page = paginator.page(page)
    except PageNotAnInteger:
        interactions_page = paginator.page(1)
    except EmptyPage:
        interactions_page = paginator.page(paginator.num_pages)

    start_index = interactions_page.start_index() if filtered_count else 0

    context = {
        'interactions': interactions_page,
        'search_query': search_query,
        'total_interactions': total_interactions,
        'filtered_count': filtered_count,
        'spotlight_interactions': spotlight_interactions,
        'start_index': start_index,
    }

    return render(request, 'interaction_list.html', context)

@method_decorator(csrf_exempt, name='dispatch')
class InteractionList(APIView):
    parser_classes = [JSONParser]

    def post(self, request, *args, **kwargs):
        logger.debug("POST method triggered.")  # 确认方法是否被调用

        try:
            logger.debug("Received request data: %s", request.data)

            if isinstance(request.data, list):
                errors = []
                for item in request.data:
                    serializer = InteractionSerializer(data=item)
                    if serializer.is_valid():
                        serializer.save()
                        logger.debug("Data successfully saved.")

                    else:
                        logger.error("Validation errors: %s", serializer.errors)

                        errors.append(serializer.errors)

                if errors:
                    logger.error("Validation errors: %s", errors)
                    return Response(errors, status=status.HTTP_400_BAD_REQUEST)

                return Response({"detail": "All interactions synced successfully!"}, status=status.HTTP_201_CREATED)
            else:
                logger.error("Invalid data format: Expected a list of interactions.")
                return Response({"error": "Invalid data format: Expected a list of interactions."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error("An error occurred: %s", str(e))
            return Response({"error": "Internal server error. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

